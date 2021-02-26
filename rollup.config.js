const { nodeResolve } = require("@rollup/plugin-node-resolve");
const { terser } = require("rollup-plugin-terser");
const polyfills = require('rollup-plugin-node-polyfills');
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const { babel } = require("@rollup/plugin-babel");

const pkg = require('./package.json');

module.exports = [
    {
        // UMD
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
            terser(),
        ],
        output: {
            file: `dist/paychex.collector-ga.min.js`,
            format: "umd",
            name: pkg.name,
            esModule: false,
            exports: "named",
            sourcemap: true,
        },
    },
    // ESM
    {
        input: 'index.mjs',
        external: ['lodash-es', '@paychex/core'],
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
        },
    },
    // CJS
    {
        input: 'index.mjs',
        external: ['lodash', '@paychex/core'],
        plugins: [
            replace({
                'lodash-es': 'lodash',
                preventAssignment: true,
            }),
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
        },
    },
];