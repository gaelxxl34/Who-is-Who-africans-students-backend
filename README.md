# Who is Who Educhain Backend

## Running the Schema SQL in Supabase

To fix the "health_check table does not exist" error, follow these steps:

1. Open your browser and go to [Supabase Dashboard](https://app.supabase.io/)
2. Log in with your Supabase account
3. Select your project (with URL: https://ssijrorhkjxjbdrdxade.supabase.co)
4. In the left sidebar, click on "SQL Editor"
5. Click the "+ New Query" button
6. Copy the entire contents of your schema.sql file from:
   ```
   /Applications/XAMPP/htdocs/who-is-who/backend/scripts/schema.sql
   ```
7. Paste the SQL into the editor
8. Click the "Run" button to execute the script
9. Wait for the script to complete (you should see success messages)
10. Return to your terminal and restart your Node.js server:
    ```
    npm run dev
    ```
11. Test the connection again:
    ```
    http://localhost:5500/api/test-supabase
    ```

You should now see a successful connection response from the API.
