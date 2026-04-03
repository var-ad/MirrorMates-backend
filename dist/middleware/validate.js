"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.z = void 0;
exports.validate = validate;
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
function validate(schema) {
    return (req, _res, next) => {
        if (schema.body) {
            req.body = schema.body.parse(req.body);
        }
        if (schema.params) {
            req.params = schema.params.parse(req.params);
        }
        if (schema.query) {
            req.query = schema.query.parse(req.query);
        }
        next();
    };
}
