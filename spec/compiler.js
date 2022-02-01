require('ts-node').register({
    project: './tsconfig.spec.json'
});

require('expect').extend({
    fail(message) {
        return {
            pass: false,
            message: () => message,
        };
    },
});