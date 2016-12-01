'use strict'

const lodash = require('lodash')

exports.create = create

const ContentTypeTextHTML = 'text/html'
const ContentTypeJSONStream = 'application/x-json-stream'
const ContentTypeEventStream = 'text/event-stream'

// Create a new event stream for an HTTP request.
function create (context, logger, req, res) {
  return new EventStream(context, logger, req, res)
}

// Handles writing to, closing, detecting closure of event stream.
class EventStream {

  constructor (context, logger, req, res) {
    this._context = context
    this._req = req
    this._res = res
    this._isClosed = false
    this._isEventStream = false
    this.Logger = logger

    // accept headers:
    // * chrome:  text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    // * firefox: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
    // * safari:  text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
    // * curl:    */*
    // * wget:    */*
    this._contentType = req.accepts([
      ContentTypeJSONStream,
      ContentTypeEventStream,
      ContentTypeTextHTML
    ])

    if (this._contentType === ContentTypeTextHTML) {
      this._contentType = 'text/plain'
    }

    if (this._contentType === ContentTypeEventStream) {
      this._isEventStream = true
    }

    this._res.writeHead(200, {
      'Content-Type': this._contentType,
      'Access-Control-Allow-Origin': '*'
    })

    this._req.on('close', () => this.close())
    this._res.on('close', () => this.close())
  }

  // write a heartbeat comment
  writeHeartBeat () {
    if (this._isClosed) return false

    if (!this._isEventStream) return true

    this._res.write(': heart beat\n')
    return true
  }

  // Write an error to the event stream.
  // Returns true if the error was written, false if stream was closed.
  writeError (id, name, message, errorProps) {
    if (this._isClosed) return false

    const event = {}

    if (id) event.id = id

    event.error = {
      name: name,
      message: message
    }

    if (errorProps != null) {
      for (let key in errorProps) {
        event.error[key] = errorProps[key]
      }
    }

    this._res.write(this.frameLine(JSON.stringify(event)))
    return true
  }

  // write 2K worth of filler comment, for polyfills
  writeFiller () {
    if (this._isClosed) return false
    if (!this._isEventStream) return true

    this._res.write(`: ${new Array(4096).join(' ')}\n`)
    return true
  }

  // write an event to the event stream
  // Returns true if the event was written, false if stream was closed.
  writeData (id, body) {
    if (body == null) {
      body = id
      id = null
    }
    if (this._isClosed) return false

    const event = lodash.defaults({}, body)

    if (id) event.id = id

    try {
      this._res.write(this.frameLine(JSON.stringify(event)))
    } catch (err) {
      this.Logger.error('Could not write to event stream.', err, this)
    }
    return true
  }

  // Close the event stream.
  close () {
    if (this._isClosed) return false
    if (this._res == null) return

    if (this._contentType === ContentTypeEventStream) {
      this._res.write(this.frameLine('{"end": true}'))
    }

    try {
      this._res.end()
    } catch (err) {
      this.Logger.error(err, 'error closing event-stream socket')
    }

    clearInterval(this.heartBeatInterval)

    this._isClosed = true
    this._context = null
    this._req = null
    this._res = null
    this.heartBeatInterval = true
  }

  frameLine (line) {
    if (this._isEventStream) {
      return `data: ${line}\n\n`
    } else {
      return `${line}\n`
    }
  }
  // Returns indication of whether the stream is closed or not.
  isClosed () {
    return this._isClosed
  }

}
