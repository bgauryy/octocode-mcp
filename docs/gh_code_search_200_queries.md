# GitHub Code Search Query Examples - 200 Comprehensive Examples

This document contains 200 examples of GitHub code search queries using the `gh search code` command, demonstrating all available filters and their combinations.

## Basic Search Queries

### 1. Simple term searches
```bash
# Search code matching "react" "lifecycle" ("react" AND "lifecycle")
gh search code react lifecycle

# Search code matching "error handling"
gh search code "error handling"

# Search code matching "authentication"
gh search code authentication

# Search code matching "useState hook"
gh search code "useState hook"

# Search code matching "async await"
gh search code "async await"
```

## Language Filter Examples

### 2. Popular languages
```bash
# Search code matching "deque" in Python files
gh search code deque --language=python

# Search code matching "useState" in JavaScript files
gh search code useState --language=javascript

# Search code matching "interface" in TypeScript files
gh search code interface --language=typescript

# Search code matching "HashMap" in Java files
gh search code HashMap --language=java

# Search code matching "goroutine" in Go files
gh search code goroutine --language=go

# Search code matching "cargo" in Rust files
gh search code cargo --language=rust

# Search code matching "namespace" in PHP files
gh search code namespace --language=php

# Search code matching "def" in Ruby files
gh search code def --language=ruby

# Search code matching "struct" in Swift files
gh search code struct --language=swift

# Search code matching "coroutine" in Kotlin files
gh search code coroutine --language=kotlin
```

### 3. System languages
```bash
# Search code matching "malloc" in C files
gh search code malloc --language=c

# Search code matching "std::vector" in C++ files
gh search code "std::vector" --language=cpp

# Search code matching "mov" in Assembly files
gh search code mov --language=assembly

# Search code matching "echo" in Shell scripts
gh search code echo --language=shell

# Search code matching "FROM" in Dockerfiles
gh search code FROM --language=dockerfile

# Search code matching "apiVersion" in YAML files
gh search code apiVersion --language=yaml
```

## Owner Filter Examples

### 4. Organization searches
```bash
# Search code matching "cli" in repositories owned by microsoft organization
gh search code cli --owner=microsoft

# Search code matching "react" in repositories owned by facebook organization
gh search code react --owner=facebook

# Search code matching "tensorflow" in repositories owned by google organization
gh search code tensorflow --owner=google

# Search code matching "aws" in repositories owned by amazon organization
gh search code aws --owner=amazon

# Search code matching "kafka" in repositories owned by apache organization
gh search code kafka --owner=apache

# Search code matching "terraform" in repositories owned by hashicorp organization
gh search code terraform --owner=hashicorp

# Search code matching "container" in repositories owned by kubernetes organization
gh search code container --owner=kubernetes

# Search code matching "angular" in repositories owned by google organization
gh search code angular --owner=google

# Search code matching "pytorch" in repositories owned by pytorch organization
gh search code pytorch --owner=pytorch

# Search code matching "jupyter" in repositories owned by jupyter organization
gh search code jupyter --owner=jupyter
```

## Repository Filter Examples

### 5. Specific repository searches
```bash
# Search code matching "panic" in the GitHub CLI repository
gh search code panic --repo cli/cli

# Search code matching "useState" in the React repository
gh search code useState --repo facebook/react

# Search code matching "extension" in the VS Code repository
gh search code extension --repo microsoft/vscode

# Search code matching "tensor" in the TensorFlow repository
gh search code tensor --repo tensorflow/tensorflow

# Search code matching "component" in the Vue.js repository
gh search code component --repo vuejs/vue

# Search code matching "rustc" in the Rust repository
gh search code rustc --repo rust-lang/rust

# Search code matching "goroutine" in the Go repository
gh search code goroutine --repo golang/go

# Search code matching "pod" in the Kubernetes repository
gh search code pod --repo kubernetes/kubernetes

# Search code matching "provider" in the Terraform repository
gh search code provider --repo hashicorp/terraform

# Search code matching "notebook" in the Jupyter repository
gh search code notebook --repo jupyter/notebook
```

## Filename Filter Examples

### 6. Configuration files
```bash
# Search code matching keyword "lint" in package.json files
gh search code lint --filename package.json

# Search code matching "python" in requirements.txt files
gh search code python --filename requirements.txt

# Search code matching "build" in Dockerfile files
gh search code build --filename Dockerfile

# Search code matching "script" in webpack.config.js files
gh search code script --filename webpack.config.js

# Search code matching "extends" in .eslintrc files
gh search code extends --filename .eslintrc

# Search code matching "version" in README.md files
gh search code version --filename README.md

# Search code matching "dependency" in pom.xml files
gh search code dependency --filename pom.xml

# Search code matching "test" in jest.config.js files
gh search code test --filename jest.config.js

# Search code matching "deploy" in .github/workflows files
gh search code deploy --filename "*.yml"

# Search code matching "ignore" in .gitignore files
gh search code ignore --filename .gitignore
```

## Extension Filter Examples

### 7. File extensions
```bash
# Search code matching "import" in JavaScript files
gh search code import --extension=js

# Search code matching "interface" in TypeScript files
gh search code interface --extension=ts

# Search code matching "Component" in JSX files
gh search code Component --extension=jsx

# Search code matching "Props" in TSX files
gh search code Props --extension=tsx

# Search code matching "class" in Python files
gh search code class --extension=py

# Search code matching "public" in Java files
gh search code public --extension=java

# Search code matching "func" in Go files
gh search code func --extension=go

# Search code matching "fn" in Rust files
gh search code fn --extension=rs

# Search code matching "def" in Ruby files
gh search code def --extension=rb

# Search code matching "namespace" in PHP files
gh search code namespace --extension=php
```

## Match (in:) Filter Examples

### 8. Search scope
```bash
# Search code matching "octocat" in file paths only
gh search code octocat in:path

# Search code matching "config" in file content only
gh search code config in:file

# Search code matching "utils" in both file contents and file paths
gh search code utils in:file,path

# Search code matching "test" in file paths only
gh search code test in:path

# Search code matching "helper" in both file contents and file paths
gh search code helper in:file,path

# Search code matching "component" in file paths only
gh search code component in:path

# Search code matching "service" in file content only
gh search code service in:file

# Search code matching "model" in both file contents and file paths
gh search code model in:file,path

# Search code matching "controller" in file paths only
gh search code controller in:path

# Search code matching "database" in both file contents and file paths
gh search code database in:file,path
```

## Size Filter Examples

### 9. File size filters
```bash
# Search code matching "config" in files larger than 100KB
gh search code config --size=">100"

# Search code matching "test" in files smaller than 50KB
gh search code test --size="<50"

# Search code matching "documentation" in files between 10KB and 100KB
gh search code documentation --size="10..100"

# Search code matching "license" in files smaller than 5KB
gh search code license --size="<5"

# Search code matching "build" in files larger than 200KB
gh search code build --size=">200"

# Search code matching "readme" in files between 1KB and 10KB
gh search code readme --size="1..10"

# Search code matching "package" in files smaller than 20KB
gh search code package --size="<20"

# Search code matching "database" in files larger than 50KB
gh search code database --size=">50"

# Search code matching "script" in files between 5KB and 50KB
gh search code script --size="5..50"

# Search code matching "config" in files smaller than 1KB
gh search code config --size="<1"
```

## Combined Filter Examples

### 10. Language + Owner combinations
```bash
# Search TypeScript code for "interface" in Microsoft repos
gh search code interface --language=typescript --owner=microsoft

# Search Python code for "tensorflow" in Google repos
gh search code tensorflow --language=python --owner=google

# Search JavaScript code for "react" in Facebook repos
gh search code react --language=javascript --owner=facebook

# Search Go code for "kubernetes" in CNCF repos
gh search code kubernetes --language=go --owner=cncf

# Search Java code for "spring" in Spring repos
gh search code spring --language=java --owner=spring-projects

# Search Rust code for "async" in Mozilla repos
gh search code async --language=rust --owner=mozilla

# Search Ruby code for "rails" in Rails repos
gh search code rails --language=ruby --owner=rails

# Search PHP code for "laravel" in Laravel repos
gh search code laravel --language=php --owner=laravel

# Search Swift code for "ios" in Apple repos
gh search code ios --language=swift --owner=apple

# Search Kotlin code for "android" in Google repos
gh search code android --language=kotlin --owner=google
```

### 11. Language + Filename combinations
```bash
# Search JavaScript code for "test" in test files
gh search code test --language=javascript --filename="*.test.js"

# Search TypeScript code for "config" in config files
gh search code config --language=typescript --filename="*.config.ts"

# Search Python code for "setup" in setup.py files
gh search code setup --language=python --filename=setup.py

# Search JavaScript code for "webpack" in webpack config files
gh search code webpack --language=javascript --filename=webpack.config.js

# Search YAML code for "image" in docker-compose files
gh search code image --language=yaml --filename=docker-compose.yml

# Search JSON code for "dependencies" in package.json files
gh search code dependencies --language=json --filename=package.json

# Search Shell code for "install" in install scripts
gh search code install --language=shell --filename="install.sh"

# Search Dockerfile code for "FROM" in Dockerfiles
gh search code FROM --language=dockerfile --filename=Dockerfile

# Search JavaScript code for "eslint" in eslintrc files
gh search code eslint --language=javascript --filename=.eslintrc.js

# Search TypeScript code for "jest" in jest config files
gh search code jest --language=typescript --filename=jest.config.ts
```

### 12. Owner + Repo combinations
```bash
# Search for "component" in React Core repo by Facebook
gh search code component --owner=facebook --repo=facebook/react

# Search for "extension" in VS Code repo by Microsoft
gh search code extension --owner=microsoft --repo=microsoft/vscode

# Search for "tensor" in TensorFlow repo by Google
gh search code tensor --owner=tensorflow --repo=tensorflow/tensorflow

# Search for "route" in Vue.js repo
gh search code route --owner=vuejs --repo=vuejs/vue

# Search for "middleware" in Express repo
gh search code middleware --owner=expressjs --repo=expressjs/express

# Search for "query" in GraphQL repo
gh search code query --owner=graphql --repo=graphql/graphql-js

# Search for "hook" in React repo
gh search code hook --owner=facebook --repo=facebook/react

# Search for "plugin" in Webpack repo
gh search code plugin --owner=webpack --repo=webpack/webpack

# Search for "provider" in Redux repo
gh search code provider --owner=reduxjs --repo=reduxjs/redux

# Search for "observable" in RxJS repo
gh search code observable --owner=ReactiveX --repo=ReactiveX/rxjs
```

### 13. Extension + Owner combinations
```bash
# Search TypeScript files for "interface" in Microsoft repos
gh search code interface --extension=ts --owner=microsoft

# Search JSX files for "Component" in Facebook repos
gh search code Component --extension=jsx --owner=facebook

# Search Python files for "model" in Google repos
gh search code model --extension=py --owner=google

# Search Go files for "handler" in Kubernetes repos
gh search code handler --extension=go --owner=kubernetes

# Search Rust files for "trait" in Mozilla repos
gh search code trait --extension=rs --owner=mozilla

# Search Ruby files for "controller" in GitHub repos
gh search code controller --extension=rb --owner=github

# Search PHP files for "class" in Laravel repos
gh search code class --extension=php --owner=laravel

# Search Swift files for "protocol" in Apple repos
gh search code protocol --extension=swift --owner=apple

# Search Kotlin files for "coroutine" in JetBrains repos
gh search code coroutine --extension=kt --owner=JetBrains

# Search Java files for "annotation" in Spring repos
gh search code annotation --extension=java --owner=spring-projects
```

### 14. Complex multi-filter combinations
```bash
# Search JavaScript React hooks in Facebook repos
gh search code "useState" --language=javascript --owner=facebook --filename="*.jsx"

# Search Python async code in small files from Google
gh search code "async def" --language=python --owner=google --size="<10"

# Search TypeScript interfaces in Microsoft VS Code config files
gh search code interface --language=typescript --owner=microsoft --repo=microsoft/vscode --filename="*.config.ts"

# Search Go error handling in Kubernetes controller files
gh search code "if err != nil" --language=go --owner=kubernetes --filename="*controller*.go"

# Search Rust unsafe blocks in Mozilla repos under 50KB
gh search code "unsafe" --language=rust --owner=mozilla --size="<50"

# Search Docker multi-stage builds in small Dockerfiles
gh search code "FROM.*AS" --language=dockerfile --filename=Dockerfile --size="<5"

# Search React TypeScript components in Vercel repos
gh search code "React.FC" --language=typescript --owner=vercel --extension=tsx

# Search Python decorators in Django repos in test files
gh search code "@" --language=python --owner=django --filename="*test*.py"

# Search JavaScript async functions in Node.js repos
gh search code "async function" --language=javascript --owner=nodejs --extension=js

# Search YAML GitHub Actions in Microsoft repos
gh search code "runs-on path:*.yml" --language=yaml --owner=microsoft
```

### 15. Search with multiple terms
```bash
# Search for authentication and authorization together
gh search code authentication authorization

# Search for docker compose setup
gh search code docker compose setup

# Search for react hooks useState useEffect
gh search code react hooks useState useEffect

# Search for error handling try catch
gh search code error handling try catch

# Search for async await promise
gh search code async await promise

# Search for test unit integration
gh search code test unit integration

# Search for database connection pool
gh search code database connection pool

# Search for api rest graphql
gh search code api rest graphql

# Search for cache redis memcached
gh search code cache redis memcached

# Search for security oauth jwt
gh search code security oauth jwt
```

### 16. Exact phrase searches
```bash
# Search for exact phrase "error handling"
gh search code "error handling"

# Search for exact phrase "dependency injection"
gh search code "dependency injection"

# Search for exact phrase "event driven architecture"
gh search code "event driven architecture"

# Search for exact phrase "continuous integration"
gh search code "continuous integration"

# Search for exact phrase "machine learning"
gh search code "machine learning"

# Search for exact phrase "design patterns"
gh search code "design patterns"

# Search for exact phrase "code review"
gh search code "code review"

# Search for exact phrase "pull request"
gh search code "pull request"

# Search for exact phrase "best practices"
gh search code "best practices"

# Search for exact phrase "performance optimization"
gh search code "performance optimization"
```

### 17. Path-specific searches
```bash
# Search for "test" in test directories
gh search code "test path:*/test/*"

# Search for "config" in config directories
gh search code "config path:*/config/*"

# Search for "security" in security paths
gh search code "security path:*/security/*"

# Search for "auth" in authentication paths
gh search code "auth path:*/auth/*"

# Search for "api" in API directories
gh search code "api path:*/api/*"

# Search for "model" in models directories
gh search code "model path:*/models/*"

# Search for "controller" in controllers directories
gh search code "controller path:*/controllers/*"

# Search for "service" in services directories
gh search code "service path:*/services/*"

# Search for "util" in utils directories
gh search code "util path:*/utils/*"

# Search for "helper" in helpers directories
gh search code "helper path:*/helpers/*"
```

### 18. Framework-specific searches
```bash
# Search for React hooks in JavaScript files
gh search code "use[A-Z]" --language=javascript --owner=facebook

# Search for Vue.js lifecycle hooks
gh search code "mounted created" --language=javascript --owner=vuejs

# Search for Angular decorators
gh search code "@Component @Injectable" --language=typescript --owner=angular

# Search for Django models
gh search code "models.Model" --language=python --filename="models.py"

# Search for Spring Boot annotations
gh search code "@SpringBootApplication" --language=java --extension=java

# Search for Rails migrations
gh search code "ActiveRecord::Migration" --language=ruby --filename="*migrate*.rb"

# Search for Express middleware
gh search code "app.use" --language=javascript --filename="*.js"

# Search for Laravel controllers
gh search code "extends Controller" --language=php --filename="*Controller.php"

# Search for Flask routes
gh search code "@app.route" --language=python --extension=py

# Search for Next.js pages
gh search code "getServerSideProps getStaticProps" --language=javascript --extension=js
```

### 19. Testing-related searches
```bash
# Search for Jest tests
gh search code "describe it expect" --language=javascript --filename="*.test.js"

# Search for Pytest fixtures
gh search code "@pytest.fixture" --language=python --filename="test_*.py"

# Search for JUnit tests
gh search code "@Test" --language=java --filename="*Test.java"

# Search for RSpec tests
gh search code "describe context it" --language=ruby --filename="*_spec.rb"

# Search for Mocha tests
gh search code "describe it chai" --language=javascript --filename="*.spec.js"

# Search for PHPUnit tests
gh search code "extends TestCase" --language=php --filename="*Test.php"

# Search for Go tests
gh search code "func Test" --language=go --filename="*_test.go"

# Search for Rust tests
gh search code "#[test]" --language=rust --extension=rs

# Search for Swift tests
gh search code "XCTest" --language=swift --filename="*Tests.swift"

# Search for Kotlin tests
gh search code "@Test fun" --language=kotlin --filename="*Test.kt"
```

### 20. DevOps and CI/CD searches
```bash
# Search for GitHub Actions workflows
gh search code "on: push pull_request" --language=yaml --filename=".github/workflows/*.yml"

# Search for CircleCI configs
gh search code "version: 2" --language=yaml --filename=".circleci/config.yml"

# Search for Travis CI configs
gh search code "language: script:" --language=yaml --filename=".travis.yml"

# Search for Jenkinsfiles
gh search code "pipeline agent stages" --filename="Jenkinsfile"

# Search for Docker Compose files
gh search code "version: services:" --language=yaml --filename="docker-compose.yml"

# Search for Kubernetes manifests
gh search code "apiVersion: kind:" --language=yaml --extension=yaml

# Search for Terraform configurations
gh search code "resource provider" --language=hcl --extension=tf

# Search for Ansible playbooks
gh search code "hosts: tasks:" --language=yaml --filename="*.yml"

# Search for Helm charts
gh search code "apiVersion: v2" --language=yaml --filename="Chart.yaml"

# Search for GitLab CI configs
gh search code "stages: script:" --language=yaml --filename=".gitlab-ci.yml"
```

## Notes

- Multiple search terms are implicitly combined with AND
- Use quotes for exact phrase matching
- The `in:` qualifier can search in file content, paths, or both
- Language filter provides ~90% speed boost for popular languages
- Owner filter reduces search space by 95%+
- Default limit is 30 results, can be increased up to 100
- Only default branches are indexed for code search
- Files must be < 384 KB to be searchable
- Repositories must have < 500,000 files and activity within the last year
- Maximum 4,000 private repositories are searchable
- Forks are only searchable if they have more stars than the parent repository