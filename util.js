'use strict'

const fs = require('fs')

exports.cbNextTick = cbNextTick
exports.onlyCallOnce = onlyCallOnce
exports.loadFile = loadFile
exports.parseAddress = parseAddress
exports.normalizeAddress = normalizeAddress
exports.getHttpBaseURL = getHttpBaseURL

// Run a callback with the specified args on the next tick.
function cbNextTick (cb, args) {
  args = [].slice.call(arguments, 1)
  setImmediate(() => cb.apply(null, args))
}

// Create a version of a function which will only be called once
function onlyCallOnce (fn) {
  let called = false

  return function onlyCalledOnce () {
    if (called) return
    called = true

    return fn.apply(null, arguments)
  }
}

// Load the specified file as a string.
function loadFile (file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    return null
  }
}

// Parse a normalized address.
// The address should be in hostname:port form already.
// Returns [hostname, port].
function parseAddress (address) {
  if (!address) return null

  const match = address.match(/(.*):(.*)/)
  if (!match) return null

  return [match[1], match[2]]
}

// Normalize an address to hostname:port.
function normalizeAddress (address, defaultPort) {
  let hostname = ''
  let port = ''
  let protocol

  // peel off http:// or https:// protocol
  const match = address.match(/^(https?:\/\/)(.*)$/)
  if (match) {
    protocol = match[1]
    address = match[2]
  }

  // if a hostname or port; no `:` allowed in address without a port at end
  if (address.indexOf(':') === -1) {
    // port
    if (isInteger(address)) {
      port = address
    // hostname
    } else {
      hostname = address
    }
  // has a `:` so parse as hostname:port
  } else {
    const parts = parseAddress(address)

    hostname = parts[0]
    port = parts[1]
  }

  // apply default values
  if (hostname === '') hostname = '0.0.0.0'
  if (port === '') port = `${defaultPort}`

  if (protocol) hostname = `${protocol}${hostname}`

  if (isNaN(parseInt(port, 10))) {
    throw new Error(`non-numeric port specified in address: '${address}'`)
  }

  return `${hostname}:${port}`
}

// Return indication of whether the value is integral, even if it's a string.
function isInteger (value) {
  value = `${value}`
  return value.match(/^\d+$/) != null
}

// values for host names in server addresses that mean "wildcard", and should
// be base-valued at localhost
const WildcardHosts = [
  '0.0.0.0',
  '[::]',
  '*'
]

// Return the base url for this server; eg, https://localhost:4000/
function getHttpBaseURL (context) {
  const config = context.config
  const proto = config.web.proto
  const addr = config.web.server

  const match = addr.match(/^(.*?):(\d+)$/)
  if (match == null) return null

  let host = match[1]
  const port = match[2]

  if (WildcardHosts.indexOf(host) !== -1) host = 'localhost'

  return `${proto}://${host}:${port}`
}
