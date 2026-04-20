const axios = require('axios');
const API_URL = 'http://localhost:5001/graphql';

async function test() {
  try {
    const response = await axios.post(API_URL, {
      query: `query CausacionGrupo($codigo: String!) {
        causacionGrupo(codigo: $codigo) {
          id
          codigo
          nombre
          miembros {
            id
            userId
            user { id name email }
            cargo
            activo
          }
        }
      }`,
      variables: { codigo: 'financiera' }
    });
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

test();