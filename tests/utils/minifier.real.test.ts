/// <reference types="vitest/globals" />
/**
 * COMPREHENSIVE REAL MINIFICATION TESTS
 *
 * This test suite demonstrates actual minification for all supported file types
 * using real content examples. Unlike the main minifier.test.ts which uses mocks,
 * these tests show the actual minification output for:
 *
 * JAVASCRIPT/TYPESCRIPT/JSX:
 * - Vanilla JavaScript with functions and comments
 * - Modern JavaScript with arrow functions and destructuring
 * - TypeScript with interfaces and type annotations
 * - React JSX components with props and state
 *
 * WEB TECHNOLOGIES:
 * - HTML documents with comments and whitespace
 * - CSS with media queries, animations, and complex selectors
 * - JSON configuration files and API responses
 *
 * CONFIGURATION FILES:
 * - YAML (Docker Compose, Kubernetes manifests)
 * - TOML configuration files
 * - INI configuration files
 *
 * PROGRAMMING LANGUAGES:
 * - Python with docstrings and type hints
 * - Go with struct definitions and HTTP handlers
 * - Java with Javadoc comments
 * - SQL with complex queries and comments
 * - Shell scripts with functions and comments
 *
 * DOCUMENTATION:
 * - Markdown files with excessive whitespace
 *
 * COMPLEX SCENARIOS:
 * - JavaScript with embedded HTML strings
 * - CSS with complex selectors and pseudo-elements
 *
 * Each test follows the pattern:
 * 1. Original content with comments and whitespace
 * 2. Minification process
 * 3. Verification of exact expected output
 */
import {
  minifyContent,
  minifyGenericContent,
} from '../../src/utils/minifier.js';

describe('Real Minification Tests', () => {
  describe('JavaScript/TypeScript Real Minification', () => {
    it('should minify vanilla JavaScript with function declarations', async () => {
      const original = `// Main application logic
function calculateTax(amount, rate) {
  // Calculate tax with validation
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  
  /* 
   * Apply tax rate
   * Returns calculated tax amount
   */
  return amount * (rate / 100);
}

// Export for use in other modules
export { calculateTax };`;

      const result = await minifyContent(original, 'tax.js');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      expect(result.content).toBe(
        'function calculateTax(amount,rate){if(amount<=0)throw new Error("Amount must be positive");return amount*(rate/100)}export{calculateTax};'
      );
    });

    it('should minify modern JavaScript with arrow functions and destructuring', async () => {
      const original = `// User management utilities
const users = [
  { id: 1, name: 'Alice', email: 'alice@test.com' },
  { id: 2, name: 'Bob', email: 'bob@test.com' }
];

// Find user by ID with error handling
const findUserById = (id) => {
  const user = users.find(u => u.id === id);
  if (!user) {
    console.log('User not found:', id);
    return null;
  }
  return user;
};

// Extract user info
const getUserInfo = ({ name, email }) => ({
  displayName: name.toUpperCase(),
  contact: email
});`;

      const result = await minifyContent(original, 'users.js');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      // Verify it removes comments and whitespace but preserves functionality
      expect(result.content).not.toContain('//');
      expect(result.content).not.toContain('/*');
      expect(result.content).toContain('findUserById');
      expect(result.content).toContain('getUserInfo');
      expect(result.content).toContain('console.log');
    });

    it('should minify TypeScript with interfaces and type annotations', async () => {
      const original = `// TypeScript interface definitions
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

// Shopping cart service
class ShoppingCart {
  private items: Product[] = [];

  // Add item to cart
  addItem(product: Product): void {
    const existingItem = this.items.find(item => item.id === product.id);
    if (!existingItem) {
      this.items.push(product);
    }
  }

  // Calculate total price
  getTotal(): number {
    return this.items.reduce((total, item) => total + item.price, 0);
  }
}`;

      const result = await minifyContent(original, 'cart.ts');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      expect(result.content).not.toContain('//');
      expect(result.content).not.toContain('interface Product');
      expect(result.content).toContain('class ShoppingCart');
      expect(result.content).toContain('addItem');
      expect(result.content).toContain('getTotal');
    });

    it('should minify React JSX components', async () => {
      const original = `import React, { useState } from 'react';

// Props interface for TypeScript
interface TodoProps {
  id: number;
  text: string;
  completed: boolean;
  onToggle: (id: number) => void;
}

// Todo item component
const TodoItem: React.FC<TodoProps> = ({ id, text, completed, onToggle }) => {
  return (
    <div className="todo-item">
      <input
        type="checkbox"
        checked={completed}
        onChange={() => onToggle(id)}
      />
      <span className={completed ? 'completed' : 'active'}>
        {text}
      </span>
    </div>
  );
};

export default TodoItem;`;

      const result = await minifyContent(original, 'TodoItem.tsx');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      expect(result.content).not.toContain('//');
      expect(result.content).not.toContain('interface TodoProps');
      expect(result.content).toContain('import React');
      expect(result.content).toContain('TodoItem');
      expect(result.content).toContain('React.createElement');
    });
  });

  describe('HTML Real Minification', () => {
    it('should minify HTML document with comments and whitespace', async () => {
      const original = `<!DOCTYPE html>
<!-- Main application layout -->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!-- Viewport meta tag for responsive design -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My App</title>
</head>
<body>
    <!-- Main content area -->
    <header>
        <h1>Welcome to My App</h1>
    </header>
    
    <main>
        <section class="content">
            <!-- Article content -->
            <article>
                <h2>Article Title</h2>
                <p>This is a paragraph with some text.</p>
            </article>
        </section>
    </main>
    
    <!-- Footer section -->
    <footer>
        <p>&copy; 2024 My Company</p>
    </footer>
</body>
</html>`;

      const result = minifyGenericContent(original, 'index.html');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>My App</title></head><body><header><h1>Welcome to My App</h1></header><main><section class="content"><article><h2>Article Title</h2><p>This is a paragraph with some text.</p></article></section></main><footer><p>&copy; 2024 My Company</p></footer></body></html>'
      );
    });

    it('should minify HTML with inline SVG', async () => {
      const original = `<div class="icon-container">
    <!-- SVG icon -->
    <svg width="24" height="24" viewBox="0 0 24 24">
        <!-- Path for the icon -->
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
</div>`;

      const result = minifyGenericContent(original, 'icon.html');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '<div class="icon-container"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>'
      );
    });
  });

  describe('CSS Real Minification', () => {
    it('should minify CSS with media queries and animations', async () => {
      const original = `/* Main stylesheet */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

/* Button styles */
.btn {
  display: inline-block;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.btn:hover {
  background-color: #0056b3;
}

/* Responsive design */
@media (max-width: 768px) {
  .container {
    padding: 10px;
  }
  
  .btn {
    /* Full width on mobile */
    width: 100%;
    padding: 15px;
  }
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.5s ease-out;
}`;

      const result = minifyGenericContent(original, 'styles.css');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '.container{max-width:1200px;margin:0 auto;padding:20px;}.btn{display:inline-block;padding:10px 20px;background-color:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;transition:background-color 0.3s ease;}.btn:hover{background-color:#0056b3;}@media (max-width:768px){.container{padding:10px;}.btn{width:100%;padding:15px;}}@keyframes fadeIn{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}.fade-in{animation:fadeIn 0.5s ease-out;}'
      );
    });

    it('should minify SCSS-like CSS with nested comments', async () => {
      const original = `/* Variables would go here in real SCSS */
.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  /* Shadow for depth */
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card-header {
  /* Header styling */
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 12px;
  /* Border below header */
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}

.card-body {
  /* Body content */
  line-height: 1.6;
  color: #333;
}`;

      const result = minifyGenericContent(original, 'card.css');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '.card{border:1px solid #ddd;border-radius:8px;padding:16px;box-shadow:0 2px 4px rgba(0,0,0,0.1);}.card-header{font-size:1.2em;font-weight:bold;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;}.card-body{line-height:1.6;color:#333;}'
      );
    });
  });

  describe('JSON Real Minification', () => {
    it('should minify package.json with all common fields', async () => {
      const original = `{
  "name": "awesome-project",
  "version": "1.0.0",
  "description": "An awesome project for testing minification",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest",
    "build": "webpack --mode production",
    "dev": "webpack-dev-server --mode development"
  },
  "keywords": [
    "javascript",
    "nodejs",
    "testing",
    "minification"
  ],
  "author": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.0",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "webpack": "^5.74.0",
    "webpack-cli": "^4.10.0"
  }
}`;

      const result = minifyGenericContent(original, 'package.json');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '{"name":"awesome-project","version":"1.0.0","description":"An awesome project for testing minification","main":"index.js","scripts":{"start":"node index.js","test":"jest","build":"webpack --mode production","dev":"webpack-dev-server --mode development"},"keywords":["javascript","nodejs","testing","minification"],"author":{"name":"John Doe","email":"john@example.com"},"license":"MIT","dependencies":{"express":"^4.18.0","lodash":"^4.17.21"},"devDependencies":{"jest":"^29.0.0","webpack":"^5.74.0","webpack-cli":"^4.10.0"}}'
      );
    });

    it('should minify API response JSON', async () => {
      const original = `{
  "status": "success",
  "data": {
    "users": [
      {
        "id": 1,
        "username": "alice",
        "email": "alice@example.com",
        "profile": {
          "firstName": "Alice",
          "lastName": "Johnson",
          "age": 28,
          "preferences": {
            "theme": "dark",
            "notifications": true
          }
        }
      },
      {
        "id": 2,
        "username": "bob",
        "email": "bob@example.com",
        "profile": {
          "firstName": "Bob",
          "lastName": "Smith",
          "age": 32,
          "preferences": {
            "theme": "light",
            "notifications": false
          }
        }
      }
    ]
  },
  "pagination": {
    "current": 1,
    "total": 2,
    "perPage": 10
  }
}`;

      const result = minifyGenericContent(original, 'api-response.json');

      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '{"status":"success","data":{"users":[{"id":1,"username":"alice","email":"alice@example.com","profile":{"firstName":"Alice","lastName":"Johnson","age":28,"preferences":{"theme":"dark","notifications":true}}},{"id":2,"username":"bob","email":"bob@example.com","profile":{"firstName":"Bob","lastName":"Smith","age":32,"preferences":{"theme":"light","notifications":false}}}]},"pagination":{"current":1,"total":2,"perPage":10}}'
      );
    });
  });

  describe('YAML Real Minification', () => {
    it('should minify Docker Compose YAML', async () => {
      const original = `# Docker Compose configuration
version: '3.8'

services:
  # Web application service
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/myapp
    depends_on:
      - db
      - redis
    # Mount volume for logs
    volumes:
      - ./logs:/app/logs

  # Database service
  db:
    image: postgres:13
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Redis cache service
  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"

# Named volumes
volumes:
  postgres_data:`;

      const result = minifyGenericContent(original, 'docker-compose.yml');

      expect(result.failed).toBe(false);
      // The improved YAML minification preserves structure better
      expect(result.content).not.toContain('#'); // Comments should be removed
      expect(result.content).toContain("version: '3.8'");
      expect(result.content).toContain('services:');
      expect(result.content).toContain('web:');
      expect(result.content).toContain('build: .');
      expect(result.content).toContain('postgres:13');
      expect(result.content).toContain('redis:6-alpine');
      expect(result.content).toContain('volumes:');
      expect(result.content).toContain('postgres_data:');
      // Should preserve some structure while removing excessive whitespace
      expect(result.content.length).toBeLessThan(original.length);
    });

    it('should minify Kubernetes YAML manifest', async () => {
      const original = `# Kubernetes deployment manifest
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx

spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.20
        ports:
        - containerPort: 80
        # Resource limits
        resources:
          limits:
            memory: "128Mi"
            cpu: "500m"
          requests:
            memory: "64Mi"
            cpu: "250m"

---
# Service definition
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP`;

      const result = minifyGenericContent(original, 'deployment.yaml');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('#');
      expect(result.content).toContain('apiVersion: apps/v1');
      expect(result.content).toContain('kind: Deployment');
      expect(result.content).toContain('replicas: 3');
      expect(result.content).toContain('nginx:1.20');
    });
  });

  describe('Programming Languages Real Minification', () => {
    it('should minify Python script with docstrings and comments', async () => {
      const original = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
User management module for the application.
Handles user creation, authentication, and profile management.
"""

import hashlib
import json
from typing import Dict, Optional

class UserManager:
    """Manages user accounts and authentication."""
    
    def __init__(self):
        # In-memory storage for demo purposes
        self.users = {}
    
    def create_user(self, username: str, password: str, email: str) -> bool:
        """
        Create a new user account.
        
        Args:
            username: The desired username
            password: The user's password
            email: The user's email address
            
        Returns:
            bool: True if user was created successfully
        """
        if username in self.users:
            return False
        
        # Hash the password for security
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Store user data
        self.users[username] = {
            'password_hash': password_hash,
            'email': email,
            'active': True
        }
        return True
    
    def authenticate(self, username: str, password: str) -> bool:
        """Authenticate a user with username and password."""
        if username not in self.users:
            return False
        
        # Check password hash
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        return self.users[username]['password_hash'] == password_hash`;

      const result = minifyGenericContent(original, 'user_manager.py');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('#');
      // Note: Python docstrings (""") are not removed by the generic minifier
      expect(result.content).toContain('class UserManager:');
      expect(result.content).toContain('def create_user');
      expect(result.content).toContain('def authenticate');
      expect(result.content).toContain('import hashlib');
    });

    it('should minify Go source code with comments', async () => {
      const original = `package main

import (
	"fmt"
	"log"
	"net/http"
	"encoding/json"
)

// User represents a user in the system
type User struct {
	ID       int    \`json:"id"\`
	Username string \`json:"username"\`
	Email    string \`json:"email"\`
}

// UserService handles user operations
type UserService struct {
	users []User
}

// NewUserService creates a new user service
func NewUserService() *UserService {
	return &UserService{
		users: make([]User, 0),
	}
}

// AddUser adds a new user to the service
func (s *UserService) AddUser(user User) {
	user.ID = len(s.users) + 1
	s.users = append(s.users, user)
}

// GetUsers returns all users as JSON
func (s *UserService) GetUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	// Marshal users to JSON
	if err := json.NewEncoder(w).Encode(s.users); err != nil {
		log.Printf("Error encoding users: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

func main() {
	// Create user service
	userService := NewUserService()
	
	// Add sample users
	userService.AddUser(User{Username: "alice", Email: "alice@example.com"})
	userService.AddUser(User{Username: "bob", Email: "bob@example.com"})
	
	// Set up routes
	http.HandleFunc("/users", userService.GetUsers)
	
	fmt.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}`;

      const result = minifyGenericContent(original, 'main.go');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('//');
      expect(result.content).not.toContain('/*');
      expect(result.content).toContain('package main');
      expect(result.content).toContain('type User struct');
      expect(result.content).toContain('func NewUserService()');
      expect(result.content).toContain('func main()');
    });

    it('should minify Java class with Javadoc', async () => {
      const original = `/**
 * Calculator utility class
 * Provides basic arithmetic operations
 */
public class Calculator {
    
    /**
     * Adds two numbers
     * @param a first number
     * @param b second number
     * @return sum of a and b
     */
    public static double add(double a, double b) {
        return a + b;
    }
    
    /**
     * Subtracts two numbers
     * @param a first number
     * @param b second number
     * @return difference of a and b
     */
    public static double subtract(double a, double b) {
        return a - b;
    }
    
    /**
     * Multiplies two numbers
     * @param a first number
     * @param b second number
     * @return product of a and b
     */
    public static double multiply(double a, double b) {
        return a * b;
    }
    
    /**
     * Divides two numbers
     * @param a dividend
     * @param b divisor
     * @return quotient of a and b
     * @throws IllegalArgumentException if b is zero
     */
    public static double divide(double a, double b) {
        if (b == 0) {
            throw new IllegalArgumentException("Division by zero is not allowed");
        }
        return a / b;
    }
}`;

      const result = minifyGenericContent(original, 'Calculator.java');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('/**');
      expect(result.content).not.toContain('*/');
      expect(result.content).not.toContain('//');
      expect(result.content).toContain('public class Calculator');
      expect(result.content).toContain('public static double add');
      expect(result.content).toContain('public static double divide');
    });

    it('should minify SQL with complex queries', async () => {
      const original = `-- Database schema for e-commerce application
-- Created: 2024-01-01
-- Author: Database Team

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complex query with joins and subqueries
SELECT 
    u.username,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
    AND u.id IN (
        -- Users who made orders in the last 30 days
        SELECT DISTINCT user_id 
        FROM orders 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    )
GROUP BY u.id, u.username, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 10;`;

      const result = minifyGenericContent(original, 'schema.sql');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('--');
      expect(result.content).not.toContain('/*');
      expect(result.content).toContain('CREATE TABLE users');
      expect(result.content).toContain('CREATE TABLE products');
      expect(result.content).toContain('SELECT u.username');
      expect(result.content).toContain('LEFT JOIN orders');
    });

    it('should minify Shell script with comments', async () => {
      const original = `#!/bin/bash

# Deployment script for web application
# Usage: ./deploy.sh [environment]

set -e  # Exit on any error

# Configuration
APP_NAME="my-web-app"
DOCKER_REGISTRY="my-registry.com"
ENVIRONMENT=\${1:-staging}

# Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log "ERROR: Docker is not running"
        exit 1
    fi
}

# Build and tag Docker image
build_image() {
    log "Building Docker image..."
    docker build -t \${DOCKER_REGISTRY}/\${APP_NAME}:\${ENVIRONMENT} .
    
    # Tag as latest if production
    if [ "$ENVIRONMENT" = "production" ]; then
        docker tag \${DOCKER_REGISTRY}/\${APP_NAME}:\${ENVIRONMENT} \${DOCKER_REGISTRY}/\${APP_NAME}:latest
    fi
}

# Deploy to environment
deploy() {
    log "Deploying to $ENVIRONMENT..."
    
    # Pull latest image
    docker pull \${DOCKER_REGISTRY}/\${APP_NAME}:\${ENVIRONMENT}
    
    # Stop existing container
    docker stop \${APP_NAME}-\${ENVIRONMENT} 2>/dev/null || true
    docker rm \${APP_NAME}-\${ENVIRONMENT} 2>/dev/null || true
    
    # Run new container
    docker run -d \\
        --name \${APP_NAME}-\${ENVIRONMENT} \\
        --restart unless-stopped \\
        -p 8080:8080 \\
        \${DOCKER_REGISTRY}/\${APP_NAME}:\${ENVIRONMENT}
}

# Main execution
main() {
    log "Starting deployment process..."
    check_docker
    build_image
    deploy
    log "Deployment completed successfully!"
}

# Run main function
main`;

      const result = minifyGenericContent(original, 'deploy.sh');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('# Deployment script');
      expect(result.content).not.toContain('# Configuration');
      expect(result.content).not.toContain('# Functions');
      // Note: Shebang line is removed because it starts with #
      expect(result.content).toContain('APP_NAME="my-web-app"');
      expect(result.content).toContain('check_docker()');
      expect(result.content).toContain('build_image()');
    });
  });

  describe('Configuration Files Real Minification', () => {
    it('should minify TOML configuration', async () => {
      const original = `# Application configuration file
[database]
host = "localhost"
port = 5432
username = "dbuser"
password = "secret"
database = "myapp"

# Redis configuration
[redis]
host = "localhost"
port = 6379
# Connection pool settings
max_connections = 100
timeout = 5000

# Application settings
[app]
name = "My Application"
version = "1.0.0"
debug = false
# Server configuration
port = 8080
host = "0.0.0.0"

# Logging configuration
[logging]
level = "info"
file = "/var/log/myapp.log"
# Log rotation settings
max_size = "10MB"
max_files = 5`;

      const result = minifyGenericContent(original, 'config.toml');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('#');
      expect(result.content).toContain('[database]');
      expect(result.content).toContain('[redis]');
      expect(result.content).toContain('[app]');
      expect(result.content).toContain('[logging]');
      expect(result.content).toContain('host = "localhost"');
    });

    it('should minify INI configuration file', async () => {
      const original = `; Application configuration
[DEFAULT]
debug = false
log_level = info

; Database section
[database]
host = localhost
port = 5432
user = dbuser
; Password should be secured in production
password = secret123
database = myapp

; Email configuration
[email]
smtp_server = smtp.gmail.com
smtp_port = 587
username = noreply@myapp.com
; Use app-specific password
password = app_password
use_tls = true

; Cache settings
[cache]
; Redis configuration
type = redis
host = localhost
port = 6379
database = 0
; Connection timeout in seconds
timeout = 5`;

      const result = minifyGenericContent(original, 'app.ini');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain(';');
      expect(result.content).toContain('[DEFAULT]');
      expect(result.content).toContain('[database]');
      expect(result.content).toContain('[email]');
      expect(result.content).toContain('[cache]');
      expect(result.content).toContain('debug = false');
    });
  });

  describe('Markdown Real Minification', () => {
    it('should minify README with excessive whitespace', async () => {
      const original = `# My Awesome Project

## Description

This is a    really    awesome    project    that does amazing things.


It has multiple    features    and    capabilities.


## Installation

To install this project, run:

\`\`\`bash
npm install my-awesome-project
\`\`\`


## Usage

Here's how to use it:

\`\`\`javascript
const awesome = require('my-awesome-project');
awesome.doSomething();
\`\`\`


## Features

- Feature 1: Does something    amazing
- Feature 2: Even    more    amazing
- Feature 3: The    most    amazing


## Contributing

We welcome contributions!    Please    read    our    guidelines.


## License

MIT License - see LICENSE file for details.`;

      const result = minifyGenericContent(original, 'README.md');

      expect(result.failed).toBe(false);
      expect(result.content).not.toMatch(/[ \t]{2,}/); // No multiple spaces/tabs
      expect(result.content).not.toMatch(/\n{3,}/); // No more than 2 newlines
      expect(result.content).toContain('# My Awesome Project');
      expect(result.content).toContain('## Description');
      expect(result.content).toContain('```bash');
      expect(result.content).toContain('```javascript');
    });
  });

  describe('Complex Mixed Content Tests', () => {
    it('should handle JavaScript with embedded HTML strings', async () => {
      const original = `// Template engine module
function renderTemplate(data) {
  // Generate HTML template
  const html = \`
    <!DOCTYPE html>
    <html>
      <head>
        <title>\${data.title}</title>
      </head>
      <body>
        <!-- Main content -->
        <div class="container">
          <h1>\${data.heading}</h1>
          <p>\${data.content}</p>
        </div>
      </body>
    </html>
  \`;
  
  return html;
}

// Export the function
module.exports = { renderTemplate };`;

      const result = await minifyContent(original, 'template.js');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      expect(result.content).not.toContain('//');
      expect(result.content).toContain('function renderTemplate');
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('module.exports');
    });

    it('should handle CSS with complex selectors and pseudo-elements', async () => {
      const original = `/* Advanced CSS with pseudo-elements */
.tooltip {
  position: relative;
  display: inline-block;
  cursor: help;
}

.tooltip::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid rgba(0, 0, 0, 0.8);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.tooltip:hover::before,
.tooltip:hover::after {
  opacity: 1;
  visibility: visible;
}

/* Complex selectors */
.nav ul li:nth-child(odd) a:hover {
  background-color: #f0f0f0;
}

.form input[type="text"]:focus:invalid {
  border-color: #ff0000;
  box-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
}`;

      const result = minifyGenericContent(original, 'advanced.css');

      expect(result.failed).toBe(false);
      expect(result.content).not.toContain('/*');
      expect(result.content).toContain('.tooltip{');
      expect(result.content).toContain('.tooltip::before{');
      expect(result.content).toContain('.tooltip::after{');
      expect(result.content).toContain(':nth-child(odd)');
      expect(result.content).toContain('input[type="text"]:focus:invalid{');
    });
  });
});
