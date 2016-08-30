# mead-plugin-source-proxy

[![npm version](http://img.shields.io/npm/v/mead-plugin-source-proxy.svg?style=flat-square)](http://browsenpm.org/package/mead-plugin-source-proxy)[![Build Status](http://img.shields.io/travis/rexxars/mead-plugin-source-proxy/master.svg?style=flat-square)](https://travis-ci.org/rexxars/mead-plugin-source-proxy)[![Coverage Status](https://img.shields.io/coveralls/rexxars/mead-plugin-source-proxy/master.svg?style=flat-square)](https://coveralls.io/github/rexxars/mead-plugin-source-proxy)[![Dependency status](https://img.shields.io/david/rexxars/mead-plugin-source-proxy.svg?style=flat-square)](https://david-dm.org/rexxars/mead-plugin-source-proxy)

HTTP Proxy source for the Mead image transformer service - loads images from remote HTTP(s) servers.

## Installation

```shell
# Bundled with mead by default, but if you're feeling frisky
npm install --save mead-plugin-source-proxy
```

## Usage

**Note: Bundled with Mead and enabled by default**

Your mead configuration file (`mead --config <path-to-config.js>`):

```js
module.exports = {
  // Load the plugin
  plugins: [
    require('mead-plugin-source-proxy')
  ],

  // Define a source using the proxy adapter
  sources: [
    {
      name: 'my-proxy-source',
      adapter: 'proxy',
      config: {
        // Secure token is required for this source, to prevent abuse
        secureUrlToken: 'someToken',

        // Disallow requests to hostnames that resolve to private IP ranges (disallowed by default)
        allowPrivateHosts: false,

        // Optional, custom function to allow/disallow a request. Pass bool as second argument to the callback
        allowRequest: (url, callback) => {
          callback(null, url.includes('arnold'))
        },

        // Optional timeout in milliseconds before giving up the request (default: 7500)
        timeout: 3500,

        // Optional number of retries to attempt when encountering errors, before giving up (default: 3)
        retries: 1
      }
    }
  ]
}
```

## License

MIT-licensed. See LICENSE.
