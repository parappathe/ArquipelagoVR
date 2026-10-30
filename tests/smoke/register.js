// node --import ./tests/smoke/register.js tests/smoke/main.js
import { register } from 'node:module';
register('./hooks.js', import.meta.url);
