const { nodeResolve } = require("@rollup/plugin-node-resolve");
const { terser } = require("rollup-plugin-terser");
const polyfills = require('rollup-plugin-node-polyfills');
const commonjs = require('@rollup/plugin-commonjs');
const { babel } = require("@rollup/plugin-babel");

const pkg = require('./package.json');
const external = ['lodash-es', '@paychex/core'];
const output = {
    format: "umd",
    name: pkg.name,
    esModule: false,
    exports: "named",
    sourcemap: true,
    banner: `/*! ${pkg.name} v${pkg.version} */`,
    paths: {
        'lodash-es': 'lodash',
        '@paychex/core': '@paychex/core',
    },
    globals: {
        'lodash-es': '_',
        '@paychex/core': '@paychex/core',
    }
};

module.exports = [
    {
        // UMD
        external,
        input: 'index.mjs',
        plugins: [
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
            commonjs({
                include: /node_modules/,
            }),
            babel({
                babelHelpers: "bundled",
            }),
            polyfills(),
        ],
        output: [{
            ...output,
            file: `dist/paychex.collector-ga.js`,
        }, {
            ...output,
            plugins: [terser()],
            file: `dist/paychex.collector-ga.min.js`,
        }],
    },
    // ESM
    {
        input: 'index.mjs',
        treeshake: false,
        external,
        plugins: [
            nodeResolve(),
            commonjs({
                include: /node_modules/,
            })
        ],
        output: {
            dir: "dist/esm",
            format: "esm",
            exports: "named",
            sourcemap: true,
            banner: `/*! ${pkg.name} v${pkg.version} */`,
        },
    },
    // CJS
    {
        input: 'index.mjs',
        treeshake: false,
        external,
        plugins: [
            nodeResolve(),
            commonjs({
                include: /node_modules/,
            })
        ],
        output: {
            dir: "dist/cjs",
            format: "cjs",
            exports: "named",
            sourcemap: true,
            banner: `/*! ${pkg.name} v${pkg.version} */`,
            paths: {
                'lodash-es': 'lodash',
            }
        },
    },
];