PORT=4000
JWT_SECRET=replace-with-a-long-random-string
DB_PATH=./nolerstores.db
CORS_ORIGIN=http://localhost:5173

# Paystack — get these from https://dashboard.paystack.com/#/settings/developer
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
PAYSTACK_CALLBACK_URL=http://localhost:5173/order-confirmation.html
