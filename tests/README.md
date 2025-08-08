# Testing Guide

## Quick Start
```bash
# Run all tests
bun test

# Watch mode for development
bun test --watch

# Coverage report
bun test --coverage

# CI pipeline (tests + lint + typecheck)
bun run test:ci
```

## Test Structure
```
tests/
├── setup.ts              # Test environment setup
├── utils/                 # Test utilities and mocks
│   ├── mocks.ts          # Mock data factories
│   ├── test-helpers.ts   # Testing helper functions
│   └── db-mocks.ts       # Database mocking utilities
├── validators/           # Unit tests for validators
│   ├── para-account.test.ts
│   ├── time-limit.test.ts
│   └── once-only.test.ts
└── integration/          # Integration tests
    ├── distributor.test.ts
    └── api.test.ts
```

## Coverage Targets
- **Validators**: 95% (critical security components)
- **Business Logic**: 80% (distributor, claim processing)  
- **API Routes**: 70% (endpoint handling)
- **Utilities**: 60% (helper functions)

## Test Categories
1. **Unit Tests**: Individual component testing (validators, utilities)
2. **Integration Tests**: Component interaction testing (distributor + validators)
3. **API Tests**: HTTP endpoint testing (claim flows, health checks)

## Mock Strategy
- **Database**: Isolated test database with mock queries
- **External APIs**: Mock QuickNode and Para API responses
- **JWT Tokens**: Mock token generation and validation
- **Environment**: Controlled test environment variables