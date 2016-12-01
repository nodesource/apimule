'use strict'

const lodash = require('lodash')

exports.create = create

const ContentTypeTextHTML = 'text/html'
const ContentTypeJSONStream = 'application/x-json-stream'
const ContentTypeEventStream = 'text/event-stream'

const Noop = function () {}

// Create a new event stream for an HTTP request.
function create (context, req, res) {
  return new EventStream(context, req, res)
}

// Handles writing to, closing, detecting closure of event stream.
// All errback callbacks pass no data on success, just errors when they occur.
class EventStream {

  constructor (context, req, res) {
    this._req = req
    this._res = res
    this._isClosed = false
    this._isEventStream = false

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

  // Returns indication of whether the stream is closed or not.
  isClosed () {
    return this._isClosed
  }

  // Write an event to the event stream.
  // The callback is invoked as cb(err, null).
  writeData (body, cb) {
    if (cb == null) cb = Noop

    if (body == null) return setImmediate(cb, new Error('body was null'))

    if (this.isClosed()) return setImmediate(cb)

    const event = lodash.defaults({}, body)

    this._res.write(this._frameLine(JSON.stringify(event)), 'utf8', cb)
  }

  // Write an error to the event stream.
  // Returns true if the error was written, false if stream was closed.
  writeError (name, message, errorProps, cb) {
    if (name == null) name = 'error'
    if (message == null) message = 'an error occurred'
    if (errorProps == null) errorProps = {}
    if (cb == null) cb = Noop

    const event = {}

    event.error = {
      name: name,
      message: message
    }

    if (errorProps != null) {
      for (let key in errorProps) {
        event.error[key] = errorProps[key]
      }
    }

    this.writeData(event, cb)
  }

  // Write a comment
  writeComment (comment, cb) {
    if (comment == null) comment = 'no comment'
    if (cb == null) cb = Noop

    if (this.isClosed()) return setImmediate(cb)
    if (!this._isEventStream) return setImmediate(cb)

    this._res.write(`: ${comment}\n`, 'utf8', cb)
  }

  // Write a heartbeat comment
  writeHeartBeat (cb) {
    writeComment('heart beat', cb)
  }

  // Write 2K worth of filler comment, for polyfills
  writeFiller (cb) {
    writeComment(new Array(4096).join(' '), cb)
  }

  // Close the event stream.
  close (cb) {
    if (cb == null) cb = Noop

    if (this.isClosed()) return setImmediate(cb)

    if (this._contentType === ContentTypeEventStream) {
      this.writeData({end: true}, sentEnd)
    } else {
      setImmediate(() => sentEnd())
    }

    const self = this

    // sent end packet
    function sentEnd (err) {
      if (err) return cb(err)

      if (self._res == null) return setImmediate(cb)

      self._res.end(cb)

      self._req = null
      self._res = null
      self._isClosed = true
    }
  }

  // Write a line of data, formatted as appropriate for the type of stream.
  _frameLine (line) {
    if (this._isEventStream) {
      return `data: ${line}\n\n`
    } else {
      return `${line}\n`
    }
  }

}
