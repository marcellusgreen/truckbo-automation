/**
 * Quick Test Script for Authentication System
 * Run with: node test-auth.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch'; // You may need: npm install node-fetch

dotenv.config();

const BASE_URL = 'http://localhost:3004'; // Adjust port if different

async function testAuthentication() {
  console.log('🧪 Testing TruckBo Authentication System...\n');

  try {
    // Test 1: Initialize demo data
    console.log('1️⃣ Initializing demo data...');
    const initResponse = await fetch(`${BASE_URL}/api/auth/initialize-demo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (initResponse.ok) {
      const initResult = await initResponse.json();
      console.log('✅ Demo data initialized successfully');
      console.log('📝 Available accounts:', initResult.accounts);
    } else {
      const error = await initResponse.json();
      console.log('⚠️ Demo initialization warning:', error.message);
    }

    // Test 2: Login with demo credentials
    console.log('\n2️⃣ Testing login...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@sunbelttrucking.com',
        password: 'TruckBo2025!'
      })
    });

    if (loginResponse.ok) {
      const loginResult = await loginResponse.json();
      console.log('✅ Login successful');
      console.log('👤 User:', `${loginResult.user.firstName} ${loginResult.user.lastName}`);
      console.log('🏢 Company:', loginResult.company.name);
      console.log('🔑 Token received:', loginResult.token ? 'Yes' : 'No');
      
      // Test 3: Test invalid login
      console.log('\n3️⃣ Testing invalid login...');
      const invalidLoginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'admin@sunbelttrucking.com',
          password: 'wrongpassword'
        })
      });

      if (!invalidLoginResponse.ok) {
        const invalidResult = await invalidLoginResponse.json();
        console.log('✅ Invalid login correctly rejected:', invalidResult.message);
      } else {
        console.log('❌ Invalid login was accepted (this is a security issue!)');
      }

    } else {
      const loginError = await loginResponse.json();
      console.log('❌ Login failed:', loginError.message);
    }

    // Test 4: Test company registration
    console.log('\n4️⃣ Testing company registration...');
    const registrationData = {
      companyName: 'Test Transport LLC',
      contactEmail: 'admin@testtransport.com',
      contactPhone: '555-TEST-123',
      dotNumber: 'DOT999999',
      mcNumber: 'MC-TEST123',
      address: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TX',
        zipCode: '12345'
      },
      adminUser: {
        firstName: 'Test',
        lastName: 'Admin',
        email: 'admin@testtransport.com',
        password: 'TestPassword123!'
      },
      subscription: {
        plan: 'professional'
      }
    };

    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registrationData)
    });

    if (registerResponse.ok) {
      const registerResult = await registerResponse.json();
      console.log('✅ Registration successful');
      console.log('🏢 New company:', registerResult.company.name);
      console.log('👤 Admin user:', `${registerResult.user.firstName} ${registerResult.user.lastName}`);
      console.log('🔑 Token received:', registerResult.token ? 'Yes' : 'No');
    } else {
      const registerError = await registerResponse.json();
      console.log('❌ Registration failed:', registerError.message);
    }

    console.log('\n🎉 Authentication system test completed!');

  } catch (error) {
    console.error('🚨 Test failed with error:', error.message);
    console.log('\n📝 Make sure:');
    console.log('   • Your server is running on', BASE_URL);
    console.log('   • PostgreSQL database is accessible');
    console.log('   • Environment variables are properly configured');
  }
}

// Run the test
testAuthentication();