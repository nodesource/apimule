'use strict'

const path = require('path')
const test = require('tape')
const qsp = require('../query-string-parser')
const ThisFile = path.join(path.basename(__dirname), path.basename(__filename))

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

test(`${ThisFile} unused parms`, function (t) {
  try {
    const data = qsp.parse(['id'], { id: '1', app: 'x' })
    t.equal(data.warnings.length, 1, 'should be a warning')
    t.equal(data.app, undefined, 'should not get app from query')
    t.equal(data.id, '1', 'should get id from query')
  } catch (err) {
    console.log(err.message, err.stack)
  }
  t.end()
})

test(`${ThisFile} subParseDate with param ''`, function (t) {
  const result = qsp.subParseDate('')
  t.equals(result, null, 'Returns null')
  t.end()
})

test(`${ThisFile} subParseDate with no param`, function (t) {
  try {
    const result = qsp.subParseDate()
    t.equals(result, null, 'Returns null')
  } catch (err) {
    t.end(err)
  }
  t.end()
})

test(`${ThisFile} subParseDate with invalid param`, function (t) {
  const result = qsp.subParseDate('test')
  t.equals(result, null, 'Returns null')
  t.end()
})

test(`${ThisFile} subParseDate with an ISO string`, function (t) {
  const result = qsp.subParseDate(new Date().toISOString())
  t.equals(typeof result, 'number', 'Returns a number.')
  t.end()
})

test(`${ThisFile} subParseDuration with no params`, function (t) {
  const result = qsp.subParseDuration()
  t.equals(result, null, 'Returns null.')
  t.end()
})

test(`${ThisFile} subParseDuration with param 1s`, function (t) {
  const answer = 1000
  const result = qsp.subParseDuration('1s')
  t.equals(result, answer, `Returns ${answer}.`)
  t.end()
})

test(`${ThisFile} subParseDuration with param 40s`, function (t) {
  const answer = 40 * 1000
  const result = qsp.subParseDuration('40s')
  t.equals(result, answer, `Returns ${answer}.`)
  t.end()
})

test(`${ThisFile} subParseDuration with param 40m`, function (t) {
  const answer = 40 * 1000 * 60
  const result = qsp.subParseDuration('40m')
  t.equals(result, answer, `Returns ${answer}.`)
  t.end()
})

test(`${ThisFile} parseValueSingle with matching attr and value`, function (t) {
  const query = {
    dog: 'fido'
  }
  const value = query.dog
  const data = {}
  const prop = 'dog'

  qsp.parseValueSingle(query, data, prop)
  t.notOk(query.hasOwnProperty(prop), 'prop is deleted from query')
  t.equals(data[prop], value, 'prop is added to data')
  t.end()
})

test(`${ThisFile} parseValueSingle with nonmatching attr and value`, function (t) {
  const query = {
    dog: 'fido'
  }
  const data = {}
  const prop = 'dog1'

  qsp.parseValueSingle(query, data, prop)
  t.notOk(query.hasOwnProperty(prop), 'prop is deleted from query')
  t.notOk(data.hasOwnProperty(prop), 'prop is not added to data')
  t.end()
})

test(`${ThisFile} parseValueMulti with nonarray`, function (t) {
  const query = {
    dog: 'fido'
  }
  const data = {}
  const value = query.dog
  const propIn = 'dog'
  const propOut = 'dogs'

  qsp.parseValueMulti(query, data, propIn, propOut)
  t.notOk(query.hasOwnProperty(propIn), 'propIn is deleted from query')
  t.notOk(data.hasOwnProperty(propIn), `propIn is not added to data as ${propIn}`)
  t.ok(data.hasOwnProperty(propOut), `propOut is added to data as ${propOut}`)
  t.ok(Array.isArray(data[propOut]), 'prop is added to data')
  t.deepEquals(data.dogs, [value], 'value is correct')
  t.end()
})

test(`${ThisFile} parseValueMulti with array`, function (t) {
  const query = {
    dog: ['fido', 'spot']
  }
  const data = {}
  const value = query.dog
  const propIn = 'dog'
  const propOut = 'dogs'

  qsp.parseValueMulti(query, data, propIn, propOut)
  t.notOk(query.hasOwnProperty(propIn), 'propIn is deleted from query')
  t.notOk(data.hasOwnProperty(propIn), `propIn is not added to data as ${propIn}`)
  t.ok(data.hasOwnProperty(propOut), `propOut is added to data as ${propOut}`)
  t.ok(Array.isArray(data[propOut]), 'prop is added to data')
  t.deepEquals(data.dogs, value, 'value is correct')
  t.end()
})
