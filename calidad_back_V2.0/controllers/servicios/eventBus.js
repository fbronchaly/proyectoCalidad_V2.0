// controllers/flux/eventBus.js

const EventEmitter = require('events');

// Creamos una única instancia compartida para toda la app
const eventBus = new EventEmitter();

module.exports = eventBus;
