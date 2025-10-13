# Infrastructure & DevOps Resources

> DevOps, containerization, CI/CD, and infrastructure for Node.js/TypeScript applications

**🎯 Purpose:** Infrastructure resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers deploying Node.js applications to production
**🌐 Focus:** Docker, Kubernetes, CI/CD, monitoring for Node.js
**📱 Mobile:** CI/CD for React Native builds (runs on Node.js infrastructure)
**⚙️ Runtime:** Node.js containers, npm scripts, GitHub Actions, serverless

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **infrastructure guidance** to help AI agents:
1. **Containerize apps** - Docker best practices for Node.js applications
2. **Setup CI/CD** - GitHub Actions, GitLab CI with Node.js pipelines
3. **Deploy serverless** - Vercel, Netlify, AWS Lambda for Node.js
4. **Monitor production** - Logging, metrics, tracing for Node.js services
5. **Build mobile apps** - EAS Build, Fastlane with Node.js tooling

**Generation Priorities:**
- ⚡ **Docker** - Containerize Node.js apps with multi-stage builds
- ⚡ **GitHub Actions** - CI/CD for Node.js projects (test, build, deploy)
- ⚡ **Vercel** - Best deployment for Next.js applications
- ⚡ **Grafana + Prometheus** - Monitoring Node.js in production

---

## Containerization

### Docker Essentials

**⭐ containers/podman** (29,198 stars)
- Podman: A tool for managing OCI containers and pods
- 🔗 https://github.com/containers/podman
- **Use Case:** Daemonless container engine alternative to Docker
- **Why:** No daemon required, rootless by default, Docker-compatible CLI

**⭐ abiosoft/colima** (24,993 stars)
- Container runtimes on macOS (and Linux) with minimal setup
- 🔗 https://github.com/abiosoft/colima
- **Use Case:** Docker Desktop alternative for macOS
- **Why:** Lightweight, fast, and resource-efficient

**⭐ containerd/containerd** (19,399 stars)
- An open and reliable container runtime
- 🔗 https://github.com/containerd/containerd
- **Use Case:** Industry-standard container runtime
- **Why:** Production-grade runtime used by Kubernetes

**⭐ veggiemonk/awesome-docker** (34,122 stars)
- A curated list of Docker resources and projects
- 🔗 https://github.com/veggiemonk/awesome-docker
- **Use Case:** Comprehensive Docker resources
- **Why:** Community-maintained collection of Docker tools and tutorials

**⭐ yeasy/docker_practice** (25,615 stars)
- Learn and understand Docker&Container technologies, with real DevOps practice!
- 🔗 https://github.com/yeasy/docker_practice
- **Use Case:** Comprehensive Docker learning resource
- **Why:** Hands-on Docker learning with real-world examples

### Docker Security Best Practices (2025)

**Key Principles:**
- **Use Minimal Base Images:** Start with slim images like Alpine instead of ubuntu:latest to reduce attack surface
- **Run as Non-Root:** Create non-root users to prevent privilege escalation
- **Use Specific Tags:** Avoid `latest` tags; use versioned tags like `node:16.20.0`
- **Multi-Stage Builds:** Reduce final image size and remove build dependencies
- **Read-Only Filesystems:** Use `--read-only` flag to prevent container modifications
- **Secrets Management:** Never hardcode secrets; use Docker Secrets or external vaults
- **Content Trust:** Enable Docker Content Trust (DCT) for signed images
- **Regular Updates:** Keep host kernel and Docker Engine updated

**⭐ aquasecurity/trivy** (29,392 stars) ⚡ ESSENTIAL
- Find vulnerabilities, misconfigurations, secrets, SBOM in containers, Kubernetes, code repositories, clouds and more
- 🔗 https://github.com/aquasecurity/trivy
- **Use Case:** Comprehensive security scanning for containers and Kubernetes
- **Why:** Fast, accurate vulnerability scanning with zero setup

**⭐ docker/docker-bench-security** (9,502 stars)
- The Docker Bench for Security checks for dozens of common best-practices around deploying Docker containers
- 🔗 https://github.com/docker/docker-bench-security
- **Use Case:** Docker security best practices validation
- **Why:** Automated security checks based on CIS Docker Benchmark

### Container Registry

**⭐ goharbor/harbor** (26,618 stars)
- An open source trusted cloud native registry project that stores, signs, and scans content
- 🔗 https://github.com/goharbor/harbor
- **Use Case:** Enterprise-grade container registry
- **Why:** Built-in security scanning, signing, and RBAC

---

## Kubernetes & Orchestration

### Production Kubernetes Patterns (2025)

**Key Deployment Strategies:**
- **Rolling Updates:** Gradually replace old instances with new ones (zero downtime)
- **Blue/Green:** Two production environments that swap roles between live and staging
- **Canary Deployments:** Deploy updates to small user groups before full rollout
- **GitOps:** Declarative infrastructure managed through Git (Argo CD, Flux)

**Essential Tools:**
- **Cluster API:** Declarative APIs for provisioning and managing multiple clusters
- **kops:** Automated Kubernetes cluster provisioning
- **kubespray:** Ansible-based Kubernetes cluster configuration management
- **Kustomize:** YAML-based customization without templating

**⭐ rancher/rancher** (24,757 stars)
- Complete container management platform
- 🔗 https://github.com/rancher/rancher
- **Use Case:** Multi-cluster Kubernetes management
- **Why:** Unified management interface for multiple Kubernetes clusters

**⭐ argoproj/argo-cd** (20,901 stars) ⚡ HIGHLY RECOMMENDED
- Declarative Continuous Deployment for Kubernetes
- 🔗 https://github.com/argoproj/argo-cd
- **Use Case:** GitOps continuous delivery for Kubernetes
- **Why:** Industry-standard GitOps tool with declarative deployments

### Kubernetes Security

**⭐ aquasecurity/kube-bench** (7,756 stars)
- Checks whether Kubernetes is deployed according to security best practices as defined in the CIS Kubernetes Benchmark
- 🔗 https://github.com/aquasecurity/kube-bench
- **Use Case:** Kubernetes security validation
- **Why:** Automated CIS benchmark compliance checks

**⭐ freach/kubernetes-security-best-practice** (2,713 stars)
- Kubernetes Security - Best Practice Guide
- 🔗 https://github.com/freach/kubernetes-security-best-practice
- **Use Case:** Kubernetes security guidelines
- **Why:** Comprehensive security best practices for K8s

**⭐ aws/aws-eks-best-practices** (2,135 stars)
- A best practices guide for day 2 operations, including operational excellence, security, reliability, performance efficiency, and cost optimization
- 🔗 https://github.com/aws/aws-eks-best-practices
- **Use Case:** AWS EKS best practices
- **Why:** Official AWS guidance for production EKS clusters

---

## Serverless & Cloud

### LocalStack - HIGHLY RECOMMENDED for Local Development

**⭐ localstack/localstack** (60,811 stars) ⚡ HIGHLY RECOMMENDED
- A fully functional local AWS cloud stack. Develop and test your cloud & Serverless apps offline
- 🔗 https://github.com/localstack/localstack
- **Use Case:** Local AWS testing environment for development
- **Why 2025 Essential:**
  - **AWS Integration:** Now integrated with VS Code AWS Toolkit for seamless local testing
  - **Cost Savings:** Test AWS services locally without cloud costs
  - **Fast Iteration:** Test Lambda, SQS, EventBridge, and more without remote deployments
  - **CI/CD Ready:** Perfect for automated testing in CI pipelines
  - **Serverless Framework Support:** Native integration with serverless framework

### Appwrite - HIGHLY RECOMMENDED Backend-as-a-Service

**⭐ appwrite/appwrite** (53,084 stars) ⚡ HIGHLY RECOMMENDED
- Build like a team of hundreds
- 🔗 https://github.com/appwrite/appwrite
- **Use Case:** Backend-as-a-Service platform for web and mobile apps
- **Why 2025 Essential:**
  - **Full-Stack Platform:** Authentication, databases, realtime, functions, messaging in one platform
  - **Open Source:** Self-hosted alternative to Firebase
  - **Developer-Friendly:** Complete developer stack with great DX
  - **Free Hosting:** Best for full-stack developers who need both frontend and backend
  - **Multi-Cloud Compatible:** Flexible deployment across cloud providers

### Serverless Frameworks

**⭐ serverless/serverless** (46,874 stars) ⚡ ESSENTIAL
- Serverless Framework - Effortlessly build apps that auto-scale, incur zero costs when idle
- 🔗 https://github.com/serverless/serverless
- **Use Case:** THE serverless framework for AWS Lambda, Azure, GCP
- **Why:** Industry-standard framework with massive ecosystem

**⭐ firecracker-microvm/firecracker** (30,718 stars)
- Secure and fast microVMs for serverless computing
- 🔗 https://github.com/firecracker-microvm/firecracker
- **Use Case:** Lightweight virtualization for serverless
- **Why:** Powers AWS Lambda and Fargate with secure isolation

### Self-Hosted Platforms

**⭐ coollabsio/coolify** (46,278 stars)
- An open-source & self-hostable Heroku / Netlify / Vercel alternative
- 🔗 https://github.com/coollabsio/coolify
- **Use Case:** Self-hosted PaaS platform
- **Why:** Deploy apps with Git push, no vendor lock-in

**⭐ Dokploy/dokploy** (25,578 stars)
- Open Source Alternative to Vercel, Netlify and Heroku
- 🔗 https://github.com/Dokploy/dokploy
- **Use Case:** Self-hosted deployment platform
- **Why:** Simple self-hosted deployments with Docker

### API Gateway

**⭐ Kong/kong** (41,946 stars)
- The Cloud-Native Gateway for APIs & AI
- 🔗 https://github.com/Kong/kong
- **Use Case:** Cloud-native API gateway
- **Why:** High-performance gateway with plugin ecosystem

---

## Monitoring & Observability

### The Modern Observability Stack (2025)

**Key Trends:**
- **Unified Platforms:** Single pane of glass for logs, metrics, and traces
- **OpenTelemetry Standard:** 79% of organizations using OpenTelemetry in 2025
- **Open Source Dominance:** 76% of companies using open-source observability tools
- **Prometheus Still King:** 67% of companies using Prometheus in production
- **AI Integration:** Machine learning for anomaly detection and predictive alerts

### Grafana - ESSENTIAL Visualization Platform

**⭐ grafana/grafana** (70,324 stars) ⚡ ESSENTIAL
- The open and composable observability and data visualization platform
- 🔗 https://github.com/grafana/grafana
- **Use Case:** THE industry-standard observability dashboard
- **Why 2025 Essential:**
  - **Industry Standard:** Most widely adopted visualization platform
  - **Comprehensive Stack:** Grafana + Loki (logs) + Tempo (traces) + Mimir (metrics)
  - **Prometheus Integration:** Perfect pairing with Prometheus for metrics
  - **Flexible Data Sources:** Connect to any data source
  - **Rich Ecosystem:** Thousands of pre-built dashboards and plugins

**Grafana Stack Components:**
- **Grafana:** Visualization and dashboards
- **Prometheus:** Metrics collection and storage
- **Loki:** Log aggregation system
- **Tempo:** Distributed tracing backend
- **Mimir:** Scalable long-term storage for Prometheus

### SigNoz - Modern Open-Source Alternative

**⭐ SigNoz/signoz** (23,851 stars) ⚡ HIGHLY RECOMMENDED
- Open-source observability platform native to OpenTelemetry with logs, traces and metrics
- 🔗 https://github.com/SigNoz/signoz
- **Use Case:** Open source alternative to DataDog, New Relic
- **Why 2025 Essential:**
  - **All-in-One:** Unified platform for logs, metrics, and traces (no separate tools)
  - **OpenTelemetry Native:** Built on modern OpenTelemetry standard
  - **Single Datastore:** Uses ClickHouse for high performance
  - **Cost-Effective:** Self-hosted alternative to expensive SaaS tools
  - **Simple Deployment:** One installation vs. managing multiple Grafana components
  - **APM Built-In:** Application performance monitoring out of the box

**SigNoz vs Grafana:**
- **SigNoz:** Single unified deployment, OpenTelemetry-first, APM included
- **Grafana:** Multiple components to manage, flexible but complex, visualization-focused

### Time-Series Databases

**⭐ VictoriaMetrics/VictoriaMetrics** (15,156 stars)
- Fast, cost-effective monitoring solution and time series database
- 🔗 https://github.com/VictoriaMetrics/VictoriaMetrics
- **Use Case:** High-performance metrics storage
- **Why:** Prometheus-compatible, 10x better compression

**⭐ thanos-io/thanos** (13,741 stars)
- Highly available Prometheus setup with long term storage capabilities
- 🔗 https://github.com/thanos-io/thanos
- **Use Case:** Scalable Prometheus with long-term storage
- **Why:** Multi-cluster Prometheus with unlimited retention

### Cost-Effective Observability

**⭐ openobserve/openobserve** (16,820 stars)
- 10x easier, 140x lower storage cost, high performance observability platform
- 🔗 https://github.com/openobserve/openobserve
- **Use Case:** Cost-effective alternative to Elasticsearch
- **Why:** Massive cost savings with excellent performance

### Full-Stack Observability

**⭐ hyperdxio/hyperdx** (8,943 stars)
- Open source observability platform unifying session replays, logs, metrics, traces and errors
- 🔗 https://github.com/hyperdxio/hyperdx
- **Use Case:** Full-stack observability with session replay
- **Why:** Frontend and backend observability combined

**⭐ highlight/highlight** (8,895 stars)
- Open source, full-stack monitoring platform with error monitoring and session replay
- 🔗 https://github.com/highlight/highlight
- **Use Case:** Modern full-stack monitoring
- **Why:** User session replay plus backend observability

### Distributed Tracing & APM

**⭐ apache/skywalking** (24,548 stars)
- APM, Application Performance Monitoring System
- 🔗 https://github.com/apache/skywalking
- **Use Case:** Distributed tracing and APM for microservices
- **Why:** Proven APM solution for complex microservices

### AI/LLM Observability

**⭐ langfuse/langfuse** (17,000 stars)
- Open source LLM engineering platform: LLM Observability, metrics, evals, prompt management
- 🔗 https://github.com/langfuse/langfuse
- **Use Case:** LLM observability and monitoring
- **Why:** Essential for AI application monitoring and debugging

---

## CI/CD & DevOps

### 2025 CI/CD Trends

**Key Trends:**
- **GitOps Standard:** 78% of organizations adopting GitOps by 2025
- **DevSecOps Integration:** Security built into pipelines, not bolted on
- **AI & ML Integration:** Automated testing, predictive failure detection
- **GitHub Actions Dominance:** 62% personal projects, 41% organizations
- **Environment as a Service (EaaS):** On-demand development environments
- **Multi-Cloud Strategies:** Workload distribution across AWS, GCP, Azure
- **Observability Priority:** Top organizational priority for DevOps teams

**Market Growth:** DevOps market projected to reach $25.5 billion by 2028 (19.7% growth)

### GitOps & Continuous Deployment

**⭐ argoproj/argo-cd** (20,901 stars) ⚡ HIGHLY RECOMMENDED
- Declarative Continuous Deployment for Kubernetes
- 🔗 https://github.com/argoproj/argo-cd
- **Use Case:** GitOps continuous delivery for Kubernetes
- **Why 2025 Essential:**
  - **GitOps Leader:** Industry-standard GitOps tool
  - **Declarative:** Infrastructure and applications as code in Git
  - **Kubernetes Native:** Built specifically for K8s deployments
  - **Auto-Sync:** Automatic synchronization between Git and cluster state
  - **Rollback:** Easy rollback to any previous Git commit
  - **Multi-Cluster:** Manage multiple Kubernetes clusters from single control plane

### Best Practices (2025)

**Security First (DevSecOps):**
- Integrate security scanning in every pipeline stage
- Automated vulnerability scanning with Trivy
- Secret scanning and management
- SBOM (Software Bill of Materials) generation
- Runtime security monitoring

**Pipeline Optimization:**
- Parallel execution for independent tasks
- Caching dependencies and build artifacts
- Incremental builds and tests
- Fast feedback loops (< 10 minutes for CI)
- Smart test selection based on code changes

**Cross-Functional Collaboration:**
- Shared ownership of pipelines
- Infrastructure as Code (IaC) in Git
- Self-service developer environments
- ChatOps for deployment notifications
- Blameless post-mortems

**Observability:**
- Pipeline metrics and monitoring
- Deployment frequency tracking
- Lead time for changes
- Change failure rate
- Mean time to recovery (MTTR)

### All-in-One DevOps

**⭐ zhenorzz/goploy** (1,202 stars)
- Devops, Deploy, CI/CD, Terminal, Sftp, Server monitor, Crontab Manager, Nginx Manager
- 🔗 https://github.com/zhenorzz/goploy
- **Use Case:** All-in-one DevOps platform
- **Why:** Unified platform for deployment, monitoring, and management

---

## Quick Reference & Decision Guide

### Choose Your Stack Based on Needs

**Containerization:**
- **Development:** Docker Desktop (macOS/Windows) or Colima (lightweight macOS alternative)
- **Production:** containerd + Kubernetes
- **Security:** Trivy for vulnerability scanning, docker-bench-security for hardening

**Orchestration:**
- **Production K8s:** Rancher for multi-cluster management
- **Deployments:** Argo CD for GitOps
- **Security:** kube-bench for CIS compliance, Trivy for scanning

**Local Development:**
- **AWS Services:** LocalStack (HIGHLY RECOMMENDED) - test AWS locally
- **Backend:** Appwrite (HIGHLY RECOMMENDED) - full-stack BaaS platform
- **Serverless:** Serverless Framework with LocalStack integration

**Monitoring Stack Options:**

**Option 1: Traditional Grafana Stack (Most Popular)**
- Grafana (visualization) + Prometheus (metrics) + Loki (logs) + Tempo (traces)
- **Pros:** Industry standard, flexible, huge ecosystem
- **Cons:** Multiple components to manage and integrate
- **Best For:** Teams with DevOps resources, need flexibility

**Option 2: SigNoz (Modern Unified)**
- Single platform for logs, metrics, traces
- **Pros:** Simple deployment, OpenTelemetry native, unified experience
- **Cons:** Smaller ecosystem than Grafana
- **Best For:** Teams wanting simplicity, OpenTelemetry adoption

**Option 3: Cost-Effective**
- OpenObserve (140x cheaper storage) or VictoriaMetrics (Prometheus-compatible)
- **Best For:** Cost-conscious teams, high data volumes

**CI/CD:**
- **Kubernetes:** Argo CD (GitOps leader)
- **General:** GitHub Actions (most popular), Jenkins (enterprise)
- **GitOps:** Argo CD + Git as single source of truth

### Top 3 Essential Infrastructure Tools (2025)

1. **LocalStack** - Local AWS development and testing environment
2. **Grafana + Prometheus** OR **SigNoz** - Observability and monitoring
3. **Argo CD** - GitOps continuous deployment for Kubernetes

### Quick Decision Matrix

| Need | Recommended Tool | Alternative |
|------|-----------------|-------------|
| Container Security | Trivy | docker-bench-security |
| Local AWS Testing | LocalStack | AWS SAM Local |
| Backend Platform | Appwrite | Supabase, Firebase |
| Observability | SigNoz (unified) | Grafana Stack (flexible) |
| Metrics Storage | Prometheus | VictoriaMetrics |
| K8s Deployment | Argo CD | Flux |
| API Gateway | Kong | Traefik, Envoy |
| Self-Hosted PaaS | Coolify | Dokploy |

### Security Checklist

- [ ] Use Trivy for container vulnerability scanning
- [ ] Run docker-bench-security for Docker hardening
- [ ] Use kube-bench for Kubernetes security validation
- [ ] Implement non-root containers
- [ ] Use multi-stage Docker builds
- [ ] Enable Docker Content Trust (DCT)
- [ ] Scan for secrets in code and containers
- [ ] Use read-only filesystems where possible
- [ ] Implement network policies in Kubernetes
- [ ] Regular security updates for base images

---

## Essential Reading

**Container Best Practices:**
- Use specific image tags (never `latest` in production)
- Multi-stage builds for smaller, secure images
- Run as non-root user
- Read-only filesystems where possible
- Regular vulnerability scanning with Trivy

**Kubernetes Production Patterns:**
- GitOps with Argo CD for declarative deployments
- Rolling updates or blue/green for zero-downtime
- Resource limits and requests on all pods
- Network policies for security
- Regular CIS benchmark checks with kube-bench

**Observability Strategy:**
- Choose unified platform (SigNoz) or flexible stack (Grafana)
- Implement OpenTelemetry for standardized telemetry
- Monitor golden signals: latency, traffic, errors, saturation
- Use distributed tracing for microservices
- Set up proactive alerting, not reactive

**CI/CD Excellence:**
- Adopt GitOps practices with Argo CD
- Integrate security scanning in every stage
- Fast feedback loops (< 10 min CI runs)
- Automated testing and deployment
- Track DORA metrics: deployment frequency, lead time, MTTR, change failure rate

---

*Part of octocode-mcp resources collection*
