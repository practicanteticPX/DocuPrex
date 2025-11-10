const typeDefs = require('./schema');
// Usar resolvers con base de datos real
const resolvers = require('./resolvers-db');

module.exports = {
  typeDefs,
  resolvers,
};