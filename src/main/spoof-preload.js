'use strict';

// KEY INSIGHT: With contextIsolation:true, code in this preload runs in an
// ISOLATED world — changes to `navigator` here are invisible to the page.
// To patch the MAIN WORLD (where Google's detection code runs), we inject
// a <script> tag into the DOM. It executes synchronously in the main world
// before any other page scripts load.

const mainWorldPatch = `
(function () {
  'use strict';
  var brands = [
    { brand: 'Chromium',      version: '124' },
    { brand: 'Google Chrome', version: '124' },
    { brand: 'Not-A.Brand',   version: '99'  }
  ];
  var fullBrands = [
    { brand: 'Chromium',      version: '124.0.6367.201' },
    { brand: 'Google Chrome', version: '124.0.6367.201' },
    { brand: 'Not-A.Brand',   version: '99.0.0.0'       }
  ];
  var highEntropy = {
    architecture:    'arm',
    bitness:         '64',
    brands:          brands,
    fullVersionList: fullBrands,
    mobile:          false,
    model:           '',
    platform:        'macOS',
    platformVersion: '14.4.1',
    uaFullVersion:   '124.0.6367.201',
    wow64:           false
  };
  var stub = {
    brands:   brands,
    mobile:   false,
    platform: 'macOS',
    getHighEntropyValues: function () { return Promise.resolve(highEntropy); },
    toJSON: function () { return { brands: brands, mobile: false, platform: 'macOS' }; }
  };
  try {
    Object.defineProperty(navigator, 'userAgentData', {
      get: function () { return stub; },
      configurable: true
    });
  } catch (e) {}
})();
`;

// Inject into the real page DOM so it runs in the main world
try {
  const s = document.createElement('script');
  s.textContent = mainWorldPatch;
  document.documentElement.prepend(s);
  s.remove();
} catch (e) {}
