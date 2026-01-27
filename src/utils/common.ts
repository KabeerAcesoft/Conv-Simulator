export function printStartUp(port: number) {
  const environment = (process.env.NODE_ENV || '').trim();
  const DEVELOPER_ACCOUNT_ID = process.env.DEVELOPER_ACCOUNT_ID || 'n/a';

  console.log(`🟡 🧑‍💻 DEVELOPER_ACCOUNT_ID: ${DEVELOPER_ACCOUNT_ID}`);
  console.log(`🟡 NODE_ENV: ${environment}`);

  console.log(
    `🟢 running locally — ensure your CCUI private app install references the webhook endpoint exactly`,
  );

  console.log(
    `🟢 Postman collection to install CCUI application is at: ./CCUI_install/Conversation Simulator API.postman_collection.json`,
  );

  console.log('========================================');
  console.log('   LivePerson Conversation Simulator   ');
  console.log('         Backend Service Started        ');
  console.log('========================================');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
  console.log(`🏥 Health Check: http://localhost:${port}/health`);
  console.log(`📊 Metrics: http://localhost:${port}/metrics`);
  console.log('========================================');
  console.log('*');
  console.log('*');
}
