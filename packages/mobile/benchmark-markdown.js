const MarkdownIt = require('markdown-it');

const COMPLEX_MARKDOWN = `
# Comprehensive Guide to Building Scalable Applications

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture](#architecture)
3. [Implementation](#implementation)
4. [Testing](#testing)
5. [Deployment](#deployment)

---

## Introduction

Building scalable applications requires careful planning and consideration of various factors including **performance**, **maintainability**, and **extensibility**. This guide covers the essential concepts and best practices.

### Why Scalability Matters

> "Premature optimization is the root of all evil" - Donald Knuth

However, designing for scalability from the start can save significant refactoring efforts later.

## Architecture

### Microservices vs Monolith

| Aspect | Microservices | Monolith |
|--------|--------------|----------|
| Deployment | Independent | Single unit |
| Scaling | Granular | Entire app |
| Complexity | Higher | Lower |
| Team Size | Large | Small-Medium |

### Code Structure

\`\`\`typescript
interface User {
  id: string;
  email: string;
  profile: UserProfile;
  preferences: UserPreferences;
}

interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
}

interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}

class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus
  ) {}

  async createUser(data: CreateUserDTO): Promise<User> {
    const user = await this.userRepository.create(data);
    await this.eventBus.publish(new UserCreatedEvent(user));
    return user;
  }

  async updateProfile(
    userId: string,
    profile: Partial<UserProfile>
  ): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    
    const updated = await this.userRepository.update(userId, {
      profile: { ...user.profile, ...profile }
    });
    
    await this.eventBus.publish(new UserProfileUpdatedEvent(updated));
    return updated;
  }
}
\`\`\`

## Implementation

### Best Practices

1. **SOLID Principles**
   - Single Responsibility
   - Open/Closed
   - Liskov Substitution
   - Interface Segregation
   - Dependency Inversion

2. **Design Patterns**
   - Factory Pattern
   - Repository Pattern
   - Observer Pattern
   - Strategy Pattern

3. **Error Handling**

\`\`\`typescript
class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message: string, public readonly fields: Record<string, string>) {
    super('VALIDATION_ERROR', message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', \`\${resource} with id \${id} not found\`, 404);
  }
}
\`\`\`

### Database Optimization

- Use **indexes** appropriately
- Implement **connection pooling**
- Consider **read replicas** for heavy read workloads
- Use **caching layers** (Redis, Memcached)

\`\`\`sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);

CREATE INDEX idx_products_category_price 
ON products(category_id, price) 
WHERE active = true;
\`\`\`

## Testing

### Testing Pyramid

\`\`\`
        /\\
       /  \\
      / E2E\\
     /------\\
    /  Integ \\
   /----------\\
  /    Unit    \\
 /--------------\\
\`\`\`

### Unit Test Example

\`\`\`typescript
describe('UserService', () => {
  let service: UserService;
  let mockRepository: jest.Mocked<UserRepository>;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    mockEventBus = {
      publish: jest.fn(),
    };
    service = new UserService(mockRepository, mockEventBus);
  });

  describe('createUser', () => {
    it('should create user and publish event', async () => {
      const userData = { email: 'test@example.com' };
      const createdUser = { id: '1', ...userData };
      
      mockRepository.create.mockResolvedValue(createdUser);
      
      const result = await service.createUser(userData);
      
      expect(result).toEqual(createdUser);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.any(UserCreatedEvent)
      );
    });
  });
});
\`\`\`

## Deployment

### CI/CD Pipeline

\`\`\`yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: kubectl set image deployment/app
\`\`\`

### Monitoring & Observability

- **Metrics**: Prometheus + Grafana
- **Logging**: ELK Stack or Loki
- **Tracing**: Jaeger or Zipkin
- **Alerting**: PagerDuty or OpsGenie

---

## Conclusion

Building scalable applications is a journey, not a destination. Keep learning, iterating, and improving.

### Additional Resources

- [System Design Primer](https://github.com/donnemartin/system-design-primer)
- [Designing Data-Intensive Applications](https://dataintensive.net/)
- [The Twelve-Factor App](https://12factor.net/)

*Last updated: January 2025*
`;

const SIMPLE_MARKDOWN = `
# Hello World

This is a simple paragraph with **bold** and *italic* text.

- Item 1
- Item 2
- Item 3
`;

const MEDIUM_MARKDOWN = `
# Getting Started with React Native

React Native is a popular framework for building mobile applications.

## Key Features

- **Cross-platform**: Write once, run on iOS and Android
- **Hot Reloading**: See changes instantly
- **Native Components**: Use native UI components

## Code Example

\`\`\`javascript
import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <Text>Hello, World!</Text>
    </View>
  );
}
\`\`\`

### Benefits

1. Large community support
2. Extensive documentation
3. Rich ecosystem of libraries

> React Native lets you build mobile apps using only JavaScript.

For more information, visit [React Native](https://reactnative.dev).
`;

function runBenchmark(name, content, iterations = 10) {
  const md = new MarkdownIt();
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const tokens = md.parse(content, {});
    const html = md.render(content);
    const end = performance.now();
    times.push(end - start);
  }
  
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  
  return { name, median, min, max, avg, chars: content.length };
}

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║     Markdown-it Parser Benchmark (react-native-markdown-display)  ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣');
console.log('║  This measures ONLY the JS parsing time.                          ║');
console.log('║  Native component creation adds significant additional time.      ║');
console.log('║  Target: <16.67ms total for 60fps                                 ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

const tests = [
  { name: 'Simple', content: SIMPLE_MARKDOWN },
  { name: 'Medium', content: MEDIUM_MARKDOWN },
  { name: 'Complex', content: COMPLEX_MARKDOWN },
  { name: 'Complex x2', content: COMPLEX_MARKDOWN + COMPLEX_MARKDOWN },
  { name: 'Complex x3', content: COMPLEX_MARKDOWN + COMPLEX_MARKDOWN + COMPLEX_MARKDOWN },
  { name: 'Complex x5', content: COMPLEX_MARKDOWN.repeat(5) },
];

console.log('┌─────────────┬──────────┬──────────┬──────────┬──────────┬─────────┐');
console.log('│ Test        │ Median   │ Min      │ Max      │ Avg      │ Chars   │');
console.log('├─────────────┼──────────┼──────────┼──────────┼──────────┼─────────┤');

for (const test of tests) {
  const result = runBenchmark(test.name, test.content);
  const frameDrops = Math.floor(result.median / 16.67);
  const status = frameDrops === 0 ? '✓' : `↓${frameDrops}`;
  
  console.log(
    `│ ${result.name.padEnd(11)} │ ${result.median.toFixed(2).padStart(6)}ms │ ${result.min.toFixed(2).padStart(6)}ms │ ${result.max.toFixed(2).padStart(6)}ms │ ${result.avg.toFixed(2).padStart(6)}ms │ ${String(result.chars).padStart(7)} │`
  );
}

console.log('└─────────────┴──────────┴──────────┴──────────┴──────────┴─────────┘');

console.log('\n⚠️  IMPORTANT: These numbers only measure markdown-it parsing.');
console.log('   The full render cycle in React Native includes:');
console.log('   1. markdown-it parsing (measured above)');
console.log('   2. AST to React element conversion');
console.log('   3. React reconciliation');
console.log('   4. Native component creation');
console.log('   5. Yoga layout calculation');
console.log('   6. Native view rendering');
console.log('\n   T3 Chat reported ~185ms TOTAL for complex markdown with Remark.');
console.log('   Their native solution achieved ~0.4ms TOTAL.');
console.log('\n   Actual frame drops will be HIGHER than shown above.');
