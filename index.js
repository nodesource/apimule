'use strict'

const path = require('path')
const http = require('http')
const https = require('https')

const lodash = require('lodash')
const express = require('express')
const bodyParser = require('body-parser')

const util = require('./util')
const qsp = require('./query-string-parser')
const EventStream = require('./event-stream')

exports.launch = launch
exports.EventStream = EventStream
exports.qsp = qsp

let Logger
const LOG_INTERVAL = 30 * 1000 // 30 seconds
const runningQueries = new Set()

// Launch an HTTP(S) server.
// Params:
// version
function launch (context, schema, filepath, logger, cb) {
  cb = util.onlyCallOnce(cb)

  Logger = logger
  const config = context.config
  const proto = config.web.proto

  let addrString
  try {
    addrString = util.normalizeAddress(config.web.server)
  } catch (err) {
    const msg = `error parsing server address ${config.web.server}: ${err}`
    return util.cbNextTick(cb, new Error(msg))
  }

  const types = lodash.get(schema, 'params.types')
  if (types) {
    Object.keys(types).forEach(key => qsp.register({ key: key }))
  }

  const addrParts = util.parseAddress(addrString)
  const addrHost = addrParts[0]
  const addrPort = addrParts[1]

  const app = express()
  app.disable('x-powered-by')
  app.set('env', 'production')

  app.get('/', logRequest, (req, res) => {
    res.send({
      version: context.version
    })
  })

  // create a body parser for text that will take ANY content-type, or none
  const bodyCollector = bodyParser.text({type: () => true})

  // periodically log the number of running HTTP requests
  setInterval(() => {
    Logger.info(`Handling ${runningQueries.size} connected queries.`)
  }, LOG_INTERVAL).unref()

  // iterate through the http schema to get method/uri's to register
  for (let method of ['GET', 'PUT', 'POST', 'DELETE']) {
    for (let uri in schema[method]) {
      const mod = loadUriModule(filepath, method, uri)
      if (mod == null) continue

      const expressMethod = method.toLowerCase()
      const urlParam = schema[method][uri].urlParam
      const needsBody = schema[method][uri].requestBody

      // build up middleware stack
      const middleware = []

      // logger
      middleware.push(logRequest)

      // don't kill idle streaming connections, log how many are executing
      middleware.push(accountRequest)

      // if request takes a body, add body collector and parser
      if (needsBody) {
        middleware.push(bodyCollector)
        middleware.push(bodyParserChecker)
      }

      // add the actual module handler for the request at the end
      middleware.push((req, res) => {
        handleAPIRequest(context, schema, mod, method, uri, req, res)
      })

      // register primary method / uri handler
      app[expressMethod](`/api/v1/${uri}`, middleware)

      // if uri takes a url parameter, register that as well
      if (urlParam) {
        app[expressMethod](`/api/v1/${uri}/:${urlParam}`, middleware)
      }
    }
  }

  const options = {}

  if (proto === 'https') {
    let configName = 'web.https.key'
    let configVal = config.web.https.key

    const keyContents = readHttpsCreds(config, configName, configVal)
    if (keyContents == null) {
      const msg = `unable to read https key file '${configVal}'`
      return util.cbNextTick(cb, new Error(msg))
    }

    configName = 'web.https.cert'
    configVal = config.web.https.cert

    const certContents = readHttpsCreds(config, configName, configVal)
    if (certContents == null) {
      const msg = `unable to read https cert file '${configVal}'`
      return util.cbNextTick(cb, new Error(msg))
    }

    options.key = keyContents
    options.cert = certContents
  }

  let server

  try {
    if (proto === 'https') {
      server = https.createServer(options, app)
    } else {
      server = http.createServer(app)
    }
  } catch (err) {
    const msg = `error launching server at ${addrString}: ${err}`
    return util.cbNextTick(cb, new Error(msg))
  }

  server.on('error', onError)

  server.listen(addrPort, addrHost, serverListening)

  function serverListening (err) {
    if (err) return cb(err)
    const url = util.getHttpBaseURL(context)
    Logger.debug(`calculated server url: ${url}`)
    cb(null, new Server(context, server, app, schema, url))
  }

  function onError (err) {
    if (err.code === 'EADDRINUSE') {
      Logger.error('address of HTTP server already bound by another process', addrString)
    } else {
      Logger.error(err, 'error from http server')
    }

    // because this is an only-call-once cb, will not be called after server
    // is listening
    cb(err)
  }
}

// Parse a request body and sanitize.
function bodyParserChecker (req, res, next) {
  req.nsStorage = req.nsStorage || {}

  // When req.body isn't a string, will be {}, indicates error.
  // Can happen with no content-type, etc.
  if (typeof req.body !== 'string') {
    req.nsStorage.bodyErr = new Error('error processing request body')
    return next()
  }

  // parse the body back into itself, but capture error as well
  try {
    req.body = JSON.parse(req.body)
  } catch (err) {
    req.nsStorage.bodyErr = err
    return next()
  }

  // ensure it's an object, not an array, string, etc
  if (!lodash.isPlainObject(req.body)) {
    req.nsStorage.bodyErr = new Error('request body must be a JSON object, not array or primitive')
    return next()
  }

  next()
}

// Handle an HTTP API request.
function handleAPIRequest (context, schema, mod, method, uri, req, res) {
  const uriSchema = schema[method][uri]

  req.nsStorage = req.nsStorage || {}
  req.nsStorage.context = context
  req.nsStorage.uriSchema = uriSchema

  // add urlParam parm to query
  const urlParam = uriSchema.urlParam
  if (urlParam) {
    const param = req.params[urlParam]
    if (param) {
      req.query[urlParam] = param
    }
  }

  const qData = qsp.parse(uriSchema.parms, req.query)
  req.nsStorage.qData = qData

  if (qData.errors.length !== 0) {
    const errorObj = {
      error: {
        message: 'errors in query string parameters',
        errors: qData.errors
      }
    }
    res.status(400).send(errorObj)
    return
  }

  if (lodash.isString(uriSchema.response)) {
    let match = uriSchema.response.match(/^stream:(.*)/)
    if (match) {
      req.nsStorage.eventStream = EventStream.create(context, Logger, req, res)
      req.nsStorage.eventStreamType = match[1]
    }
  }

  mod.handleRequest(req, res)
}

// Load a module that handles a particular HTTP method and uri
function loadUriModule (filepath, method, uri) {
  const moduleName = `${filepath}/${method}-${uri}`
  try {
    return require(moduleName)
  } catch (err) {
    Logger.error(err, `error loading ${moduleName}`)
    return null
  }
}

// Read an HTTPS creds file.
function readHttpsCreds (config, key, relName) {
  let baseName = '.'
  if (config.fileName) baseName = path.dirname(config.fileName)

  Logger.debug(`readHttpsCreds(config, '${key}', '${relName}'), baseName: '${baseName}'`)
  const fileName = path.resolve(baseName, relName)
  Logger.debug(`readHttpsCreds() reading '${fileName}'`)

  const contents = util.loadFile(fileName)
  if (contents == null) {
    Logger.error(`error reading file '${fileName}', specified in config key ${key}`)
    return null
  }

  return contents
}

// Log interesting requests.
function logRequest (req, res, next) {
  const url = req.url
  const method = req.method
  const timeStart = Date.now()

  res.addListener('close', logWhenDone)
  res.addListener('finish', logWhenDone)

  Logger.debug(`==> ${method} ${url}`)

  next()

  function logWhenDone () {
    const timeElapsed = Date.now() - timeStart

    res.removeListener('close', logWhenDone)
    res.removeListener('finish', logWhenDone)

    const statusCode = res.statusCode || '???'
    Logger.info(`${statusCode} ${method} ${url} ${timeElapsed}ms`)
  }
}

function accountRequest (req, res, next) {
  // default socket timeout is 2 minutes, disable it
  req.setTimeout(0)

  // add request to accounting set for logging
  runningQueries.add(req)
  req.on('close', () => runningQueries.delete(req))
  req.on('end', () => runningQueries.delete(req))
  req.on('error', () => runningQueries.delete(req))
  next()
}

// Contains all the HTTP server goodness.
class Server {
  constructor (context, httpServer, app, schema, url) {
    this.context = context
    this.httpServer = httpServer
    this.app = app
    this.url = url
    this.schema = schema
  }

  shutdown () {
    // close running queries
    const shutdownErr = new Error('server shutdown')
    for (let req of runningQueries) {
      Logger.debug(`shutting down http request ${req.method} ${req.url}`)
      req.destroy(shutdownErr)
    }

    this.httpServer.close(err => this._onClose(err))
  }

  _onClose (err) {
    this.context = null
    this.httpServer = null
    this.app = null

    if (err) {
      Logger.error(err, 'error closing server')
      return
    }

    Logger.info('server closed')
  }
}
