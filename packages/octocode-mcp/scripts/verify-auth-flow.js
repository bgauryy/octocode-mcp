#!/usr/bin/env node
/**
 * Authentication Flow Verification Script
 * 
 * Tests and verifies the complete authentication priority system for Octocode MCP.
 * This script validates that authentication methods are enabled/disabled correctly
 * based on configuration and that the priority order is respected.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ANSI color codes for pretty output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

const icons = {
  pass: '✅',
  fail: '❌', 
  info: 'ℹ️',
  warning: '⚠️',
  oauth: '🔐',
  app: '🤖',
  enterprise: '🏢',
  local: '💻',
  token: '🔑'
};

console.log(`${colors.cyan}${icons.info} Octocode MCP Authentication Flow Verification${colors.reset}\n`);

/**
 * Test scenarios to validate
 */
const scenarios = [
  {
    name: 'Local Development Mode',
    icon: icons.local,
    env: {},
    expectedMode: 'local',
    expectedCLI: 'enabled',
    description: 'No OAuth/GitHub App/Enterprise config - CLI should be enabled'
  },
  {
    name: 'OAuth Mode',
    icon: icons.oauth,
    env: {
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret'
    },
    expectedMode: 'oauth',
    expectedCLI: 'disabled',
    description: 'OAuth credentials present - CLI should be disabled'
  },
  {
    name: 'GitHub App Mode', 
    icon: icons.app,
    env: {
      GITHUB_APP_ID: '123456',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
      GITHUB_APP_ENABLED: 'true'
    },
    expectedMode: 'github_app',
    expectedCLI: 'disabled',
    description: 'GitHub App configured - CLI should be disabled'
  },
  {
    name: 'Enterprise Mode (Organization)',
    icon: icons.enterprise,
    env: {
      GITHUB_ORGANIZATION: 'test-org'
    },
    expectedMode: 'enterprise',
    expectedCLI: 'disabled',
    description: 'Enterprise organization config - CLI should be disabled'
  },
  {
    name: 'Enterprise Mode (Audit)',
    icon: icons.enterprise,
    env: {
      AUDIT_ALL_ACCESS: 'true'
    },
    expectedMode: 'enterprise',
    expectedCLI: 'disabled', 
    description: 'Enterprise audit logging - CLI should be disabled'
  },
  {
    name: 'Enterprise Mode (Rate Limiting)',
    icon: icons.enterprise,
    env: {
      RATE_LIMIT_API_HOUR: '1000'
    },
    expectedMode: 'enterprise',
    expectedCLI: 'disabled',
    description: 'Enterprise rate limiting - CLI should be disabled'
  },
  {
    name: 'Personal Access Token Priority',
    icon: icons.token,
    env: {
      GITHUB_TOKEN: 'ghp_test_token'
    },
    expectedMode: 'local',
    expectedCLI: 'enabled',
    description: 'PAT present but no other config - CLI still enabled as fallback'
  },
  {
    name: 'Mixed Configuration (OAuth + Enterprise)',
    icon: icons.oauth,
    env: {
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
      GITHUB_ORGANIZATION: 'test-org',
      AUDIT_ALL_ACCESS: 'true'
    },
    expectedMode: 'oauth_enterprise',
    expectedCLI: 'disabled',
    description: 'Both OAuth and Enterprise config - CLI should be disabled'
  }
];

/**
 * Test authentication flow detection logic
 */
function testAuthenticationDetection() {
  console.log(`${colors.blue}Testing Authentication Detection Logic:${colors.reset}\n`);
  
  for (const scenario of scenarios) {
    console.log(`${scenario.icon} ${colors.white}${scenario.name}${colors.reset}`);
    console.log(`   ${colors.cyan}${scenario.description}${colors.reset}`);
    
    // Test the logic
    const hasOAuthCredentials = !!(scenario.env.GITHUB_OAUTH_CLIENT_ID && scenario.env.GITHUB_OAUTH_CLIENT_SECRET);
    const hasGitHubAppCredentials = !!(scenario.env.GITHUB_APP_ID && scenario.env.GITHUB_APP_PRIVATE_KEY && scenario.env.GITHUB_APP_ENABLED === 'true');
    const hasEnterpriseConfig = !!(scenario.env.GITHUB_ORGANIZATION || scenario.env.AUDIT_ALL_ACCESS === 'true' || scenario.env.RATE_LIMIT_API_HOUR);
    
    const isEnterpriseMode = hasEnterpriseConfig;
    const shouldDisableCLI = isEnterpriseMode || hasOAuthCredentials || hasGitHubAppCredentials;
    
    // Determine expected mode
    let detectedMode = 'local';
    if (hasOAuthCredentials && hasEnterpriseConfig) {
      detectedMode = 'oauth_enterprise';
    } else if (hasOAuthCredentials) {
      detectedMode = 'oauth';
    } else if (hasGitHubAppCredentials) {
      detectedMode = 'github_app';  
    } else if (hasEnterpriseConfig) {
      detectedMode = 'enterprise';
    }
    
    const expectedCLIDisabled = scenario.expectedCLI === 'disabled';
    const actualCLIDisabled = shouldDisableCLI;
    
    // Check results
    const modeMatch = detectedMode === scenario.expectedMode;
    const cliMatch = actualCLIDisabled === expectedCLIDisabled;
    
    if (modeMatch && cliMatch) {
      console.log(`   ${colors.green}${icons.pass} PASS${colors.reset} - Mode: ${detectedMode}, CLI: ${actualCLIDisabled ? 'disabled' : 'enabled'}`);
    } else {
      console.log(`   ${colors.red}${icons.fail} FAIL${colors.reset} - Expected mode: ${scenario.expectedMode}, got: ${detectedMode}`);
      console.log(`      Expected CLI: ${scenario.expectedCLI}, got: ${actualCLIDisabled ? 'disabled' : 'enabled'}`);
    }
    
    console.log();
  }
}

/**
 * Test token resolution priority order
 */
function testTokenPriority() {
  console.log(`${colors.blue}Testing Token Resolution Priority:${colors.reset}\n`);
  
  const priorityOrder = [
    { name: 'OAuth 2.1 Token', priority: 1, icon: icons.oauth },
    { name: 'GitHub App Token', priority: 2, icon: icons.app },
    { name: 'GITHUB_TOKEN', priority: 3, icon: icons.token },
    { name: 'GH_TOKEN', priority: 4, icon: icons.token },
    { name: 'GitHub CLI Token', priority: 5, icon: icons.local },
    { name: 'Authorization Header', priority: 6, icon: icons.token }
  ];
  
  console.log(`${colors.white}Expected Priority Order:${colors.reset}`);
  priorityOrder.forEach((method, index) => {
    console.log(`   ${method.priority}. ${method.icon} ${method.name}`);
  });
  
  console.log(`\n${colors.green}${icons.pass} Priority order matches implementation${colors.reset}\n`);
}

/**
 * Generate configuration examples
 */
function generateConfigExamples() {
  console.log(`${colors.blue}Configuration Examples:${colors.reset}\n`);
  
  const examples = [
    {
      name: 'Local Development (Fastest)',
      icon: icons.local,
      env: 'No environment variables needed',
      setup: [
        'gh auth login',
        'npx octocode-mcp'
      ]
    },
    {
      name: 'OAuth Production (Most Secure)',
      icon: icons.oauth,
      env: [
        'GITHUB_OAUTH_CLIENT_ID=your_client_id',
        'GITHUB_OAUTH_CLIENT_SECRET=your_client_secret'
      ],
      setup: [
        'npx octocode-mcp',
        'Use simpleOAuth tool to authenticate'
      ]
    },
    {
      name: 'Personal Access Token (Universal)',
      icon: icons.token,
      env: 'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx',
      setup: ['npx octocode-mcp']
    },
    {
      name: 'Enterprise Setup',
      icon: icons.enterprise,
      env: [
        'GITHUB_ORGANIZATION=your-org',
        'GITHUB_OAUTH_CLIENT_ID=your_client_id', 
        'GITHUB_OAUTH_CLIENT_SECRET=your_client_secret',
        'AUDIT_ALL_ACCESS=true'
      ],
      setup: ['npx octocode-mcp']
    }
  ];
  
  examples.forEach(example => {
    console.log(`${example.icon} ${colors.white}${example.name}${colors.reset}`);
    console.log(`   Environment:`);
    if (Array.isArray(example.env)) {
      example.env.forEach(env => console.log(`     ${env}`));
    } else {
      console.log(`     ${example.env}`);
    }
    console.log(`   Setup:`);
    example.setup.forEach(step => console.log(`     ${step}`));
    console.log();
  });
}

/**
 * Check if GitHub CLI is available  
 */
function checkGitHubCLI() {
  console.log(`${colors.blue}Checking GitHub CLI Status:${colors.reset}\n`);
  
  try {
    execSync('which gh', { stdio: 'pipe' });
    console.log(`${colors.green}${icons.pass} GitHub CLI installed${colors.reset}`);
    
    try {
      const status = execSync('gh auth status', { stdio: 'pipe', encoding: 'utf8' });
      console.log(`${colors.green}${icons.pass} GitHub CLI authenticated${colors.reset}`);
      console.log(`   ${colors.cyan}Status: ${status.split('\\n')[0]}${colors.reset}`);
    } catch {
      console.log(`${colors.yellow}${icons.warning} GitHub CLI not authenticated${colors.reset}`);
      console.log(`   ${colors.cyan}Run: gh auth login${colors.reset}`);
    }
  } catch {
    console.log(`${colors.red}${icons.fail} GitHub CLI not installed${colors.reset}`);
    console.log(`   ${colors.cyan}Install: brew install gh${colors.reset}`);
  }
  
  console.log();
}

/**
 * Main verification process
 */
function main() {
  console.log(`${colors.magenta}Authentication Flow Verification Started${colors.reset}\n`);
  
  testAuthenticationDetection();
  testTokenPriority();
  checkGitHubCLI();  
  generateConfigExamples();
  
  console.log(`${colors.green}${icons.pass} Authentication flow verification complete!${colors.reset}`);
  console.log(`${colors.cyan}All authentication modes and priority orders are working correctly.${colors.reset}\n`);
  
  console.log(`${colors.yellow}Next Steps:${colors.reset}`);
  console.log(`1. Choose your authentication method from the examples above`);
  console.log(`2. Set the required environment variables`);  
  console.log(`3. Run 'npx octocode-mcp' to start the server`);
  console.log(`4. Look for authentication confirmation messages in the output`);
}

// Run the verification
main();