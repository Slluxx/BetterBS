import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    permissions: [
      'storage',
      'scripting',
    ],
    // Only grant access to the official Burning Series domains. The background
    // uses `scripting` to run the reCAPTCHA in the page's MAIN world, which
    // only ever targets a tab the content script runs on.
    host_permissions: [
      '*://burningseries.ac/*', '*://*.burningseries.ac/*',
      '*://burningseries.cx/*', '*://*.burningseries.cx/*',
      '*://burningseries.co/*', '*://*.burningseries.co/*',
      '*://burningseries.sx/*', '*://*.burningseries.sx/*',
      '*://burningseries.vc/*', '*://*.burningseries.vc/*',
      '*://burningseries.nz/*', '*://*.burningseries.nz/*',
      '*://burningseries.se/*', '*://*.burningseries.se/*',
      '*://bs.to/*', '*://*.bs.to/*',
      '*://bs.cine.to/*', '*://*.bs.cine.to/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: "@slx-betterbs",
        data_collection_permissions: {
          required: ["none"],
          optional: []
         }
      }
    }
  },
});
