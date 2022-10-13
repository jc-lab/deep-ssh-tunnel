const path = require('path');
const { defineConfig } = require('@vue/cli-service');

/**
 *
 * @type {import('@vue/cli-service').ProjectOptions}
 */
module.exports = defineConfig({
  transpileDependencies: true,
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      /**
       *
       * @param config {import('webpack-chain').Rule}
       */
      chainWebpackMainProcess: (config) => {
        config.module
          .rule('babel')
          .before('ts')
          .test(/.(ts|js)x?$/)
          .use('babel')
          .loader('babel-loader')
          .options({
            configFile: false,
            plugins: [
              '@babel/plugin-transform-parameters'
            ],
            // presets: [
            //   ['@babel/preset-env', {
            //     modules: false,
            //     targets: {
            //       'electron': '5'
            //     }
            //   }]
            // ]
          });

        config.resolve.alias.set('cpu-features', path.resolve(__dirname, 'patch/cpu-features.js'));
      },
    }
  }
});
