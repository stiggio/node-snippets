import axios from 'axios';
import Stigg, { BillingPeriod } from '@stigg/node-server-sdk';
import _ from 'lodash';

type CustomerRecord = {
  customerId: string;
  email: string;
  name: string;
  billingId?: string | null;
  subscriptionPlanId: string;
  subscriptionStartDate: Date;
  subscriptionBillingPeriod: 'MONTHLY' | 'ANNUALLY';
  featuresUsage: Record<string, number>; // Map of featureId to usage value
};

/*
Replace this with your own source of customers, can be a CSV file, a database, etc.
 */
async function loadCustomerRecords(): Promise<CustomerRecord[]> {
  try {
    // Fetching data from a dummy users API
    const { data } = await axios.get<
      { id: string; email: string; username: string; first_name: string; last_name: string }[]
    >('https://random-data-api.com/api/v2/users?size=100');

    // Map your users to objects that Stigg can import
    return data.map((user: any) => ({
      customerId: user.uid,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      billingId: null, // Provide billingId in the case you're importing paid customers that already exists in Stripe
      subscriptionStartDate: new Date('2022-01-01T00:00:00.000Z'),
      subscriptionPlanId: 'plan-revvenu-basic',
      subscriptionBillingPeriod: 'MONTHLY',
      featuresUsage: {
        'feature-02-campaigns': 3,
      },
    }));
  } catch (err) {
    console.error('Error while loading customer records', err);
    throw err;
  }
}

async function importCustomers(customer: CustomerRecord, stigg: Stigg) {
  if (!customer.billingId) {
    console.log('Provisioning free customer', customer.customerId);
    await stigg.provisionCustomer({
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      subscriptionParams: {
        planId: customer.subscriptionPlanId,
        billingPeriod: customer.subscriptionBillingPeriod as BillingPeriod,
        startDate: customer.subscriptionStartDate,
      },
    });
  } else {
    // If it's a paid customer from Stripe, we'll need to import the customer first and then backdate a subscription
    console.log('Importing paid customer', customer.customerId);

    await stigg.importCustomer({
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      billingId: customer.billingId,
    });

    console.log('Backdating paid customer subscription', customer.customerId);

    await stigg.createSubscription({
      customerId: customer.customerId,
      planId: customer.subscriptionPlanId,
      billingPeriod: customer.subscriptionBillingPeriod as BillingPeriod,
      startDate: customer.subscriptionStartDate,
    });
  }

  console.log('Updating customer feature current usage', customer.customerId);

  await Promise.all(
    Object.entries(customer.featuresUsage).map(async ([featureId, usage]) => {
      await stigg.reportUsage({
        customerId: customer.customerId,
        featureId: featureId,
        value: usage,
      });
    }),
  );
}

export async function run() {
  const customerRecords = await loadCustomerRecords();

  const stigg = Stigg.initialize({
    apiKey: process.env.STIGG_SERVER_API_KEY,
    realtimeUpdatesEnabled: false, // You don't need realtime updates when running the SDK in a script
  });

  // Importing customers in batches of 10
  for (const batchOfCustomers of _.chunk(customerRecords, 20)) {
    await Promise.all(batchOfCustomers.map(async (customer) => importCustomers(customer, stigg)));
  }

  console.log(`Imported all ${customerRecords.length} customers`);
}
