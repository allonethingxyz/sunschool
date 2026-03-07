import { db } from '../server/db';
import { users } from '../shared/schema';
import { count, eq } from 'drizzle-orm';
import { hashPassword } from '../server/middleware/auth';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Function to generate a secure random password
function generateSecurePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\:;?><,./-=';
  let password = '';
  let bytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  
  return password;
}

async function main() {
  console.log('Starting admin onboarding workflow...');
  
  try {
    // Check if any users already exist
    const userCount = await db.select({ count: count() }).from(users);
    
    if (userCount[0].count > 0) {
      console.log('Users already exist in the system. Admin onboarding skipped.');
      process.exit(0);
    }
    
    // Check if admin already exists
    const admins = await db.select().from(users).where(eq(users.role, 'ADMIN'));
    
    if (admins.length > 0) {
      console.log('Admin already exists. Admin onboarding skipped.');
      process.exit(0);
    }
    
    // Generate a secure password for the admin
    const adminPassword = generateSecurePassword();
    
    // Create admin user
    const adminUser = {
      username: 'admin',
      email: 'admin@sunschool.xyz',
      name: 'Admin User',
      role: 'ADMIN',
      password: await hashPassword(adminPassword),
      parentId: null
    };
    
    const result = await db.insert(users).values(adminUser).returning();
    
    console.log('Admin user created successfully:', result[0].id);
    console.log('Username: admin');
    console.log('Password:', adminPassword);
    console.log('IMPORTANT: Save these credentials and change the password after first login.');
    
    // Save the credentials to a file (in a real-world scenario, you'd send an email instead)
    const credentialsInfo = `
SUNSCHOOL ADMIN CREDENTIALS
----------------------
Username: admin
Password: ${adminPassword}

IMPORTANT: This is a one-time generated password. Please change it immediately after your first login.
`;
    
    const credentialsPath = path.join(process.cwd(), 'admin-credentials.txt');
    fs.writeFileSync(credentialsPath, credentialsInfo);
    console.log(`Admin credentials saved to: ${credentialsPath}`);
    
    console.log('Admin onboarding complete!');
  } catch (error) {
    console.error('Error during admin onboarding:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error in admin onboarding workflow:', error);
  process.exit(1);
});

