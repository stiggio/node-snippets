import 'dotenv/config';
import { run } from './importCustomers';

run()
  .then(() => {
    console.error('Ran successfully');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Error occurred', e);
    process.exit(1);
  });
