/* eslint-disable id-length, no-sync, newline-per-chained-call */
const fs = require('fs')
const path = require('path')
const http = require('http')
const test = require('tape')
const nock = require('nock')
const once = require('lodash.once')
const plugin = require('..')

const proxySource = plugin.handler
const readStream = (stream, callback) => {
  const chunks = []
  const src = proxySource({})
  const cb = once(callback)
  stream
    .on('data', d => chunks.push(d))
    .on('error', err => cb(src.processStreamError(err)))
    .on('end', () => cb(null, Buffer.concat(chunks)))
}
const getLocalImageStream = () => fs.createReadStream(
  path.join(__dirname, 'fixtures', 'mead.png')
)

test('has plugin props', t => {
  ['name', 'type', 'handler'].forEach(prop => {
    t.ok(plugin[prop])
  })
  t.end()
})

test('exposes source plugin props', t => {
  const src = proxySource({})
  t.equal(typeof src.getImageStream, 'function', 'exposes `getImageStream()`')
  t.equal(typeof src.requiresSignedUrls, 'boolean', 'exposes `requiresSignedUrls`')
  t.equal(typeof src.processStreamError, 'function', 'exposes `processStreamError()`')
  t.end()
})

test('requires signed urls by default', t => {
  t.ok(proxySource({}).requiresSignedUrls)
  t.end()
})

test('throws on non-http/https url', t => {
  proxySource({}).getImageStream('ftp://bar.baz/image.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('http/https'), 'should include http/https in message')
    t.end()
  })
})

test('rejects URLs that point to private hosts by default', t => {
  proxySource({}).getImageStream('http://127.0.0.1/foo/bar.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('URL not allowed'), 'should tell the user that url is not allowed')
    t.end()
  })
})

test('can be told not to reject URLs that point to private hosts', t => {
  const localBuf = fs.readFileSync(path.join(__dirname, 'fixtures', 'mead.png'))
  const srv = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'image/png'})
    getLocalImageStream().pipe(res)
  }).listen(0, streamImage)

  function streamImage() {
    const url = `http://localhost:${srv.address().port}/image.png`

    proxySource({allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
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

  proxySource({allowRequest}).getImageStream('http://mead.science/retriever.png', err => {
    t.ok(err instanceof Error, 'should error')
    t.ok(err.message.includes('URL not allowed'), 'should tell the user that url is not allowed')
  })

  proxySource({allowRequest}).getImageStream('https://espen.codes/schnauzer.png', err => {
    t.ifError(err, 'should not error')
  })
})

test('can provide a custom function for validating requests', t => {
  const allowRequest = (url, cb) => cb(new Error('Snarkelsniffel in the capasitor'))

  proxySource({allowRequest}).getImageStream('http://mead.science/terrier.png', err => {
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

  const onStreamResponse = err => {
    t.ok(err instanceof Error, 'should error')
    t.equal(err.output.statusCode, 502, 'should give bad gateway on 5xx')
    srv.close(t.end)
  }

  const streamImage = () => {
    const url = `http://localhost:${srv.address().port}/image.png`
    proxySource({allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
  }

  srv.listen(0, streamImage)
})

test('provides passes on remote error for 4xx', t => {
  const srv = http.createServer((req, res) => {
    res.writeHead(401, {'Content-Type': 'text/plain'})
    res.end('Bad Request - Missing some kind of parameter')
  })

  const onStreamResponse = (err, stream) => {
    t.ok(err instanceof Error, 'should error')
    t.equal(err.output.statusCode, 401, 'should pass on 401')
    srv.close(t.end)
  }

  const streamImage = () => {
    const url = `http://localhost:${srv.address().port}/image.png`
    proxySource({allowPrivateHosts: true}).getImageStream(url, onStreamResponse)
  }

  srv.listen(0, streamImage)
})

test('handles open/connection timeouts', t => {
  const host = 'http://espen.codes'
  nock(host)
    .get('/image.png')
    .delayConnection(150)
    .reply(200)

  proxySource({timeout: 75}).getImageStream(`${host}/image.png`, err => {
    t.ok(err instanceof Error, 'should error')
    t.equal(err.output.statusCode, 504, 'should give 504')
    t.ok(/time-?out/i.test(err.message), 'should say timeout')
    t.end()
  })
})

test('treats unknown errors as 500s', t => {
  const host = 'http://espen.codes'
  nock(host).get('/image.png').replyWithError(new Error('Dont know'))

  proxySource().getImageStream(`${host}/image.png`, err => {
    t.ok(err instanceof Error, 'should error')
    t.equal(err.output.statusCode, 500, 'should give 500')
    t.end()
  })
})
