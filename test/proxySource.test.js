/* eslint-disable id-length, no-sync */
const fs = require('fs')
const path = require('path')
const http = require('http')
const test = require('tape')
const once = require('lodash.once')
const plugin = require('..')

const proxySource = plugin.handler
const secureUrlToken = 'foobar'
const readStream = (stream, callback) => {
  const chunks = []
  const src = proxySource({secureUrlToken})
  const cb = once(callback)
  stream
    .on('data', d => chunks.push(d))
    .on('error', err => cb(src.processStreamError(err)))
    .on('end', () => cb(null, Buffer.concat(chunks)))
}

test('has plugin props', t => {
  ['name', 'type', 'handler'].forEach(prop => {
    t.ok(plugin[prop])
  })
  t.end()
})

test('exposes source plugin props', t => {
  const src = proxySource({secureUrlToken})
  t.equal(typeof src.getImageStream, 'function', 'exposes `getImageStream()`')
  t.equal(typeof src.requiresSignedUrls, 'boolean', 'exposes `requiresSignedUrls`')
  t.equal(typeof src.processStreamError, 'function', 'exposes `processStreamError()`')
  t.end()
})

test('requires signed urls by default', t => {
  t.ok(proxySource({secureUrlToken}).requiresSignedUrls)
  t.end()
})

test('throws on missing `secureUrlToken`', t => {
  t.throws(() => proxySource({}), /secureUrlToken/)
  t.end()
})

test('throws on non-http/https url', t => {
  proxySource({secureUrlToken}).getImageStream('ftp://bar.baz/image.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('http/https'), 'should include http/https in message')
    t.end()
  })
})

test('rejects URLs that point to private hosts by default', t => {
  proxySource({secureUrlToken}).getImageStream('http://127.0.0.1/foo/bar.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('URL not allowed'), 'should tell the user that url is not allowed')
    t.end()
  })
})

test.skip('can be told not to reject URLs that point to private hosts', t => {
  const localBuf = fs.readFileSync(path.join(__dirname, 'fixtures', 'mead.png'))
  const srv = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'image/png'})
    fs.createReadStream(path.join(__dirname, 'fixtures', 'mead.png')).pipe(res)
  }).listen(0, streamImage)

  function streamImage() {
    const url = `http://localhost:${srv.address().port}/image.png`

    proxySource({secureUrlToken, allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
  }

  function onStreamResponse(err, stream) {
    t.ifError(err, 'should not error')
    readStream(stream, (readErr, remoteBuf) => {
      t.ifError(readErr, 'should not error on stream')
      t.equal(Buffer.compare(localBuf, remoteBuf), 0, 'Remote and local images should match')
      srv.close(t.end)
    })
  }
})

test('can provide a custom function for validating requests', t => {
  t.plan(3)

  const allowRequest = (url, cb) => cb(null, url.includes('schnauzer.png'))

  proxySource({secureUrlToken, allowRequest}).getImageStream('http://mead.science/retriever.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('URL not allowed'), 'should tell the user that url is not allowed')
  })

  proxySource({secureUrlToken, allowRequest}).getImageStream('https://espen.codes/schnauzer.png', err => {
    t.ifError(err, 'should not error')
  })
})

test('can provide a custom function for validating requests', t => {
  const allowRequest = (url, cb) => cb(new Error('Snarkelsniffel in the capasitor'))

  proxySource({secureUrlToken, allowRequest}).getImageStream('http://mead.science/terrier.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('Snarkelsniffel'), 'should tell the user about the error')
    t.end()
  })
})

test('provides bad gateway for remote 500s', t => {
  const srv = http.createServer((req, res) => {
    res.writeHead(500, {'Content-Type': 'text/plain'})
    res.end('Internal Server Error')
  })

  const onStreamResponse = (err, stream) => {
    t.ifError(err, 'should not error')
    readStream(stream, readErr => {
      t.ok(readErr instanceof Error, 'should error')
      t.equal(readErr.output.statusCode, 502, 'should give bad gateway on 5xx')
      srv.close(t.end)
    })
  }

  const streamImage = () => {
    const url = `http://localhost:${srv.address().port}/image.png`
    proxySource({secureUrlToken, allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
  }

  srv.listen(0, streamImage)
})

test('provides passes on remote error for 4xx', t => {
  const srv = http.createServer((req, res) => {
    res.writeHead(401, {'Content-Type': 'text/plain'})
    res.end('Bad Request - Missing some kind of parameter')
  })

  const onStreamResponse = (err, stream) => {
    t.ifError(err, 'should not error')
    readStream(stream, readErr => {
      t.ok(readErr instanceof Error, 'should error')
      t.equal(readErr.output.statusCode, 401, 'should pass on 401')
      srv.close(t.end)
    })
  }

  const streamImage = () => {
    const url = `http://localhost:${srv.address().port}/image.png`
    proxySource({secureUrlToken, allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
  }

  srv.listen(0, streamImage)
})
