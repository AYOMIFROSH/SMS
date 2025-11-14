// test-redis-conn.js
const { createClient } = require('redis');

(async () => {
  const tls = process.env.TEST_TLS === 'true';
  const client = createClient({
    socket: {
      host: 'redis-11833.c85.us-east-1-2.ec2.redns.redis-cloud.com',
      port: 11833,
      tls: tls
    },
    username: 'default',
    password: 'bF8YsQXcEItJP6OwIy8sR8qPhamBYKdU'
  });

  

  client.on('error', (err) => console.error('CLIENT-ERROR:', err && err.message));
  try {
    await client.connect();
    console.log('CONNECTED OK (tls=' + tls + ')');
    await client.set('__ci_test', 'ok', { EX: 5 });
    const v = await client.get('__ci_test');
    console.log('GET:', v);
    await client.quit();
  } catch (e) {
    console.error('CONNECT-FAIL:', e && (e.message || e));
    process.exit(1);
  }
})();
