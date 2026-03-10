# FinTrac - MySQL Backend Integration Setup

## 📋 Prerequisites

1. **XAMPP** installed with MySQL and Apache running
2. **Node.js** installed for the backend server

## 🚀 Setup Instructions

### Step 1: Database Setup

1. Open **phpMyAdmin** (http://localhost/phpmyadmin)
2. Import the `schema.sql` file OR run the SQL commands manually
3. This will create:
   - `testdb` database
   - All required tables (users, inventory, invoices, receivables, payables, sales, purchases, company_settings)
   - A sample admin user (email: admin@fintrac.com, password: admin123)

### Step 2: Install Backend Dependencies

```bash
npm install express mysql2 cors bcryptjs jsonwebtoken
```

Or if using yarn:
```bash
yarn add express mysql2 cors bcryptjs jsonwebtoken
```

### Step 3: Configure Database Connection

Open `db.js` and update the MySQL connection if needed:

```javascript
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",  // Your MySQL password (empty for XAMPP default)
  database: "testdb",
});
```

### Step 4: Start the Backend Server

```bash
node db.js
```

You should see:
```
✅ Connected to MySQL
✅ Server running on http://localhost:3001
```

### Step 5: Start the Frontend

```bash
npm run dev
```

## 🔐 Testing the Application

### Default Login Credentials
- **Email**: admin@fintrac.com
- **Password**: admin123

Or create a new account via the signup page!

## 📊 Features Now Connected to MySQL

✅ **Authentication**
- Login/Signup with bcrypt password hashing
- JWT token-based sessions
- Secure user isolation

✅ **Inventory Management**
- Add, edit, delete products
- Real-time stock tracking
- All data persists in MySQL

✅ **Billing & Invoices**
- Create and manage invoices
- Mark as paid functionality
- Invoice history tracking

✅ **Receivables & Payables**
- Track money owed to you
- Track money you owe
- Status management (Pending/Paid/Overdue)

✅ **Reports & Analytics**
- Sales vs Purchases charts
- Tax summaries
- Real-time dashboard statistics

✅ **Settings**
- Company information
- Nepali locale (NPR currency)
- Timezone: Asia/Kathmandu

## 🔧 API Endpoints

### Authentication
- `POST /api/register` - Create new account
- `POST /api/login` - Login

### Inventory
- `GET /api/inventory` - Get all products
- `POST /api/inventory` - Add product
- `PUT /api/inventory/:id` - Update product
- `DELETE /api/inventory/:id` - Delete product

### Invoices
- `GET /api/invoices` - Get all invoices
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

### Receivables
- `GET /api/receivables` - Get all receivables
- `POST /api/receivables` - Add receivable
- `PUT /api/receivables/:id` - Update receivable
- `DELETE /api/receivables/:id` - Delete receivable

### Payables
- `GET /api/payables` - Get all payables
- `POST /api/payables` - Add payable
- `PUT /api/payables/:id` - Update payable
- `DELETE /api/payables/:id` - Delete payable

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Settings
- `GET /api/settings` - Get company settings
- `POST /api/settings` - Save settings

## 🐛 Troubleshooting

### Backend won't start
- Ensure MySQL is running in XAMPP
- Check if port 3001 is already in use
- Verify database credentials in `db.js`

### "Cannot connect to database" error
- Confirm XAMPP MySQL service is running
- Run the `schema.sql` to create the database
- Check database name matches in `db.js`

### Frontend can't reach backend
- Ensure backend is running on port 3001
- Check for CORS errors in browser console
- Verify API_URL in `src/services/api.ts` is correct

### Authentication issues
- Clear localStorage and refresh
- Check if JWT token is being sent in headers
- Verify user exists in database

## 📝 Notes

- All passwords are hashed using bcrypt
- JWT tokens expire after 7 days
- Each user's data is isolated (user_id foreign key)
- NPR currency formatting applied throughout
- Nepali locale (DD/MM/YYYY) date format

## 🎯 Next Steps

Now you have a fully functional SaaS MVP with:
- ✅ Real MySQL database backend
- ✅ Secure authentication
- ✅ Complete CRUD operations
- ✅ User data isolation
- ✅ Nepali localization

Happy coding! 🚀
