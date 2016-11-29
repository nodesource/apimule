'use strict'

const path = require('path')

const test = require('tape')

const qsp = require('../query-string-parser')

const ThisFile = path.join(path.basename(__dirname), path.basename(__filename))

runTests()

function runTests () {
  test(`${ThisFile} unknown group`, function (t) {
    let caught = false
    try {
      qsp.parse(['unknownGroup'], { id: '1' })
    } catch (err) {
      caught = true
    }
    t.ok(caught, 'should throw an exception for unknown group names')
    t.end()
  })

  test(`${ThisFile} agentScope id`, function (t) {
    const data = qsp.parse(['agentScope'], { id: '1' })
    t.equal(data.id, '1', 'should get id from query')
    t.end()
  })

  test(`${ThisFile} agentScope app`, function (t) {
    const data = qsp.parse(['agentScope'], { app: 'x' })
    t.equal(data.app, 'x', 'should get app from query')
    t.end()
  })

  test(`${ThisFile} agentScope tag single`, function (t) {
    const data = qsp.parse(['agentScope'], { tag: 't' })
    t.deepEqual(data.tags, ['t'], 'should get single tag from query')
    t.end()
  })

  test(`${ThisFile} agentScope tag multi`, function (t) {
    const data = qsp.parse(['agentScope'], { tag: ['t', 'u'] })
    t.deepEqual(data.tags, ['t', 'u'], 'should get multi tag from query')
    t.end()
  })

  test(`${ThisFile} agentScope hostname`, function (t) {
    const data = qsp.parse(['agentScope'], { hostname: 'hosty' })
    t.equal(data.hostname, 'hosty', 'should get hostname from query')
    t.end()
  })

  test(`${ThisFile} agentScope app tag hostname`, function (t) {
    const data = qsp.parse(['agentScope'], { app: 'x', tag: 'y', hostname: 'z' })
    t.equal(data.app, 'x', 'should get app from query')
    t.deepEqual(data.tags, ['y'], 'should get tag from query')
    t.equal(data.hostname, 'z', 'should get hostname from query')
    t.end()
  })

  test(`${ThisFile} agentScope id app`, function (t) {
    const data = qsp.parse(['agentScope'], { id: '1', app: 'x' })
    t.equal(data.warnings.length, 1, 'should be a warning')
    t.equal(data.app, undefined, 'should not get app from query')
    t.equal(data.id, '1', 'should get id from query')
    t.end()
  })

  test(`${ThisFile} id`, function (t) {
    const data = qsp.parse(['id'], { id: '1' })
    t.equal(data.id, '1', 'should get id from query')
    t.end()
  })

  test(`${ThisFile} duration`, function (t) {
    let data

    data = qsp.parse(['duration'], { duration: '0' })
    t.equal(data.duration, 0, 'should parse duration 0')

    data = qsp.parse(['duration'], { duration: '1' })
    t.equal(data.duration, 1, 'should parse duration 1')

    data = qsp.parse(['duration'], { duration: '42' })
    t.equal(data.duration, 42, 'should parse duration 1')

    // TODO: duration used to support the full range of suffixes, has been
    // changed to only support integral values;
    // SO, we should make sure these suffix tests get moved somewhere else,
    // since startEnd times still use them.

    // data = qsp.parse(['duration'], { duration: '-1' })
    // t.equal(data.duration, -1000, 'should parse duration -1')

    // data = qsp.parse(['duration'], { duration: '1ms' })
    // t.equal(data.duration, 1, 'should parse 1ms')

    // data = qsp.parse(['duration'], { duration: '-1ms' })
    // t.equal(data.duration, -1, 'should parse -1ms')

    // data = qsp.parse(['duration'], { duration: '1s' })
    // t.equal(data.duration, 1000, 'should parse 1s')

    // data = qsp.parse(['duration'], { duration: '1m' })
    // t.equal(data.duration, 1000 * 60, 'should parse 1m')

    // data = qsp.parse(['duration'], { duration: '1h' })
    // t.equal(data.duration, 1000 * 60 * 60, 'should parse 1h')

    // data = qsp.parse(['duration'], { duration: '1d' })
    // t.equal(data.duration, 1000 * 60 * 60 * 24, 'should parse 1d')

    // data = qsp.parse(['duration'], { duration: '1w' })
    // t.equal(data.duration, 1000 * 60 * 60 * 24 * 7, 'should parse 1w')

    t.end()
  })

  test(`${ThisFile} nameData`, function (t) {
    let data

    data = qsp.parse(['nameData'], { name: 'n' })
    t.equal(data.name, 'n', 'should handle name')

    data = qsp.parse(['nameData'], { name: 'n', data: 'd' })
    t.equal(data.name, 'n', 'should handle name')
    t.equal(data.data, 'd', 'should handle data')

    data = qsp.parse(['nameData'], { data: 'd' })
    t.equal(data.errors.length, 1, 'should have one error')
    t.equal(data.data, undefined, 'should not set data')

    t.end()
  })

  test(`${ThisFile} field`, function (t) {
    let data

    data = qsp.parse(['fields'], { field: 'f' })
    t.deepEqual(data.fields, ['f'], 'should handle single field')

    data = qsp.parse(['fields'], { field: ['f', 'g'] })
    t.deepEqual(data.fields, ['f', 'g'], 'should handle multi field')

    t.end()
  })

  test(`${ThisFile} interval`, function (t) {
    let data

    data = qsp.parse(['interval', 'startEnd'], { interval: '1', start: 0, end: 0 })
    t.deepEqual(data.interval, 1000, 'should handle unit-less interval')

    data = qsp.parse(['interval', 'startEnd'], { interval: '3m', start: 0, end: 0 })
    t.deepEqual(data.interval, 1000 * 60 * 3, 'should handle granularity in minutes')

    t.end()
  })

  test(`${ThisFile} startEnd`, function (t) {
    let data

    const daten = Date.now()
    const dates = `${daten}`

    data = qsp.parse(['startEnd'], { start: dates })
    t.equal(data.start, daten, 'should handle start')

    data = qsp.parse(['startEnd'], { start: dates, end: dates })
    t.equal(data.start, daten, 'should handle start')
    t.equal(data.end, daten, 'should handle end')

    data = qsp.parse(['startEnd'], { end: dates })
    t.equal(data.end, undefined, 'end with no start should not set end')
    t.equal(data.errors.length, 1, 'end with no start should be an error')

    data = qsp.parse(['startEnd'], { start: '-10m', end: '10m' })
    const dateSta = new Date(daten - 20 * 60 * 1000)
    const dateEnd = new Date(daten + 20 * 60 * 1000)
    t.ok(data.start > dateSta, 'should handle negative relative date (1)')
    t.ok(data.start < daten, 'should handle negative relative date (2)')
    t.ok(data.end > daten, 'should handle positive relative date (1)')
    t.ok(data.end < dateEnd, 'should handle positive relative date (2)')

    const iDate = new Date(daten).toISOString()
    data = qsp.parse(['startEnd'], { start: iDate, end: iDate })
    t.ok(data.start === daten, 'should handle ISO dates for start')
    t.ok(data.end === daten, 'should handle ISO dates for end')

    t.end()
  })

  test(`${ThisFile} agg`, function (t) {
    let data

    data = qsp.parse(['agg'], { agg: 'mean' })
    t.equal(data.agg, 'mean', 'should handled agg=mean')

    data = qsp.parse(['agg'], { agg: 'Xmean' })
    t.equal(data.agg, undefined, 'should not set agg for bad value')
    t.equal(data.errors.length, 1, 'should have error message for bad valued agg')

    t.end()
  })

  test(`${ThisFile} unused parms`, function (t) {
    const data = qsp.parse(['id'], { id: '1', app: 'x' })
    t.equal(data.warnings.length, 1, 'should be a warning')
    t.equal(data.app, undefined, 'should not get app from query')
    t.equal(data.id, '1', 'should get id from query')
    t.end()
  })
}
