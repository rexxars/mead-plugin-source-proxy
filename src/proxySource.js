const pkg = require('../package.json')
const got = require('got')
const Boom = require('boom')
const parallel = require('async.parallel')
const urlIsPrivate = require('url-is-private')

const headers = {
  'User-Agent': `mead/proxy ${pkg.version} (https://github.com/rexxars/mead)`
}

const defaultConfig = {
  allowPrivateHosts: false,
  timeout: 7500,
  retries: 3
}

function proxySource(conf) {
  const config = Object.assign({}, defaultConfig, conf)

  if (!config.secureUrlToken) {
    throw Boom.badImplementation('Proxy sources require a `secureUrlToken` configuration parameter')
  }

  return {
    getImageStream: getImageStreamer(config),
    requiresSignedUrls: true,
    processStreamError
  }
}

function getImageStreamer(config) {
  return (...args) => getImageStream(config, ...args)
}

function getImageStream(config, url, callback) {
  if (!/^https?:\/\//i.test(url)) {
    setImmediate(callback, Boom.badRequest('Only http/https URLs are supported'))
    return
  }

  const validators = [
    !config.allowPrivateHosts && isPrivateUrl(url),
    config.allowRequest && partialValidator(config.allowRequest, url)
  ].filter(Boolean)

  parallel(validators, (err, results) => {
    if (err) {
      callback(err)
      return
    }

    if (results.every(Boolean)) {
      callback(null, got.stream(url, {
        headers,
        timeout: config.timeout,
        retries: config.retries
      }))
      return
    }

    callback(Boom.badRequest('URL not allowed'))
  })
}

function processStreamError(error) {
  const {statusCode, statusMessage} = error
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
  handler: proxySource,
  getImageStream
}
