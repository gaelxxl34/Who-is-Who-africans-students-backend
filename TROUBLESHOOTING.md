# Troubleshooting Supabase Connection

If you're having trouble connecting to Supabase, follow this checklist:

## 1. Check Your .env File

Make sure your `.env` file contains the correct Supabase credentials:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

These values can be found in your Supabase dashboard under Project Settings > API.

## 2. Verify the Schema Exists

Run our test connection script:

```bash
npm run test-connection
```

If it shows the health_check table doesn't exist, you need to create your database schema:

1. Go to Supabase Dashboard > SQL Editor
2. Open the `schema.sql` file from the `backend/scripts` directory
3. Copy and paste the entire SQL into the Supabase SQL Editor
4. Run the script

## 3. Check RLS Policies

If you can connect but get permission errors:

1. Go to Supabase Dashboard > Authentication > Policies
2. Make sure the "Allow anonymous select on health_check" policy exists
3. If not, run the portion of the schema.sql that creates the policies

## 4. Test the API Endpoint

Once everything is set up, test the API:

```
GET http://localhost:5500/api/test-supabase
```

You should get a response with `success: true` and some data.

## 5. Common Errors and Solutions

- **"relation 'public.health_check' does not exist"**: Run the schema.sql script in Supabase.
- **"Authentication error"**: Your SUPABASE_URL or SUPABASE_ANON_KEY is incorrect.
- **"Permission denied"**: The RLS policies aren't set up correctly.
- **"Connection refused"**: The Supabase service might be down or your internet connection is having issues.

Need more help? Check the [Supabase documentation](https://supabase.com/docs).

# Troubleshooting Guide for Who is Who Educhain Backend

## Common Issues and Solutions

### 1. Missing Dependencies

**Symptoms:**
- Error: `Cannot find module 'X'`
- Server crashes on startup

**Solution:**
Run the setup script to install all required dependencies:
```bash
npm run setup
```

For specific missing modules, you can install them directly:
```bash
npm install bcrypt jsonwebtoken
```

### 2. bcrypt Installation Issues

**Symptoms:**
- Error related to bcrypt compilation
- `node-gyp` errors during installation

**Solution:**
bcrypt requires compilation tools. Try these approaches:

1. Install node-gyp requirements for your platform:
   - Windows: `npm install --global --production windows-build-tools`
   - macOS: `xcode-select --install`
   - Linux: `sudo apt-get install build-essential python`

2. Use our fallback authentication that doesn't rely on bcrypt:
   The system will automatically use a fallback if bcrypt isn't available.

### 3. Supabase Connection Issues

**Symptoms:**
- Error: `The health_check table does not exist`
- Database connection errors

**Solution:**
1. Check your `.env` file has the correct Supabase credentials
2. Run the schema setup SQL in Supabase:
   ```bash
   npm run show-schema
   ```
   Then copy and paste the output into your Supabase SQL Editor

### 4. JWT Errors

**Symptoms:**
- "jwt malformed" errors
- Authentication failing after successful login

**Solution:**
1. Make sure you have a `JWT_SECRET` defined in your `.env` file
2. Check that your frontend is correctly storing and sending the token

### 5. Development Server Not Restarting

**Symptoms:**
- Changes to files not reflecting in the running application
- Nodemon not detecting changes

**Solution:**
1. Restart the server manually: Ctrl+C and then `npm run dev`
2. Check if nodemon is watching the correct files
3. Clear the node cache: `npm cache clean --force`

### 6. Port Already in Use

**Symptoms:**
- Error: `EADDRINUSE: address already in use :::5500`

**Solution:**
1. Kill the process using the port:
   ```bash
   # On macOS/Linux
   lsof -i :5500
   kill -9 <PID>
   
   # On Windows
   netstat -ano | findstr :5500
   taskkill /PID <PID> /F
   ```
2. Change the port in your `.env` file

## Quick Start After Fixing Issues

Once you've resolved any issues, start the server with:
```bash
npm run dev
```

## Contact Support

If you continue experiencing issues, please contact our development team at support@whoiwhoeduchain.com.
