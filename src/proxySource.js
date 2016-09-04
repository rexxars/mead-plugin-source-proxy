const Boom = require('boom')
const httpGet = require('simple-get')
const parallel = require('async.parallel')
const urlIsPrivate = require('url-is-private')
const debug = require('debug')('mead:proxy')
const pkg = require('../package.json')

const headers = {
  'User-Agent': `mead/proxy ${pkg.version} (https://github.com/rexxars/mead)`
}

const defaultConfig = {
  allowPrivateHosts: false,
  timeout: 7500,
  maxRedirects: 3
}

function proxySource(conf) {
  const config = Object.assign({}, defaultConfig, conf)

  return {
    getImageStream: getImageStreamer(config),
    requiresSignedUrls: true,
    processStreamError: wrapError
  }
}

function getImageStreamer(config) {
  return (...args) => getImageStream(config, ...args)
}

function getImageStream(config, url, callback) {
  debug(`Request for URL ${url}`)

  if (!/^https?:\/\//i.test(url)) {
    debug('Rejecting URL because of HTTP/HTTPS prefix check')
    setImmediate(callback, Boom.badRequest('Only http/https URLs are supported'))
    return
  }

  const state = {
    aborted: false,
    request: null,
    timeout: null
  }

  const validators = [
    !config.allowPrivateHosts && isPrivateUrl(url),
    config.allowRequest && partialValidator(config.allowRequest, url)
  ].filter(Boolean)

  parallel(validators, (err, results) => {
    if (err) {
      debug('Request validator threw error')
      callback(err)
      return
    }

    if (!results.every(Boolean)) {
      debug('Request validator returned false, disallowing request')
      callback(Boom.badRequest('URL not allowed'))
      return
    }

    debug(`Performing HTTP request with connection timeout @ ${config.timeout}`)
    state.timeout = setTimeout(timeoutRequest, config.timeout, 'open')
    state.request = httpGet({
      url,
      headers,
      maxRedirects: config.maxRedirects
    }, onResponse)
  })

  function onResponse(err, response) {
    clearTimeout(state.timeout)

    if (err) {
      debug('Request failed (%s) with message: %s', err.code, err.message)
      callback(wrapError(err, state))
      return
    }

    if (response.statusCode >= 400) {
      debug('Response code was HTTP %d, rejecting', response.statusCode)
      callback(wrapError(httpError(response)))
      return
    }

    callback(null, response)
  }

  function timeoutRequest(type) {
    debug('Timeout reached while opening connection, aborting request')
    state.aborted = true
    state.request.abort()
  }
}

function httpError(res) {
  const {statusCode, statusMessage} = res
  const err = new Error(`HTTP ${statusCode} ${statusMessage}`)
  err.statusCode = statusCode
  err.statusMessage = statusMessage
  return err
}

function wrapError(err, state = {}) {
  if (err.code === 'ECONNRESET' && state.aborted) {
    return Boom.gatewayTimeout()
  }

  if (err.code === 'ESOCKETTIMEDOUT') {
    return Boom.badGateway('Socket error trying to reach remote server')
  }

  const {statusCode, statusMessage} = err
  if (!statusCode) {
    return Boom.badImplementation(err)
  }

  return statusCode >= 500
    ? Boom.badGateway(statusMessage)
    : Boom.create(statusCode, statusMessage)
}

function partialValidator(validator, url) {
  return cb => validator(url, cb)
}

function isPrivateUrl(url) {
  return cb => urlIsPrivate.isPrivate(url, (err, isPrivate) => {
    cb(err, !isPrivate)
  })
}

module.exports = {
  name: 'proxy',
  type: 'source',
  handler: proxySource
}
