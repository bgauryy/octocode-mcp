# GitHub Repository Search Query Examples - 200 Comprehensive Examples

This document contains 200 examples of GitHub repository search queries using the `gh search repos` command, demonstrating all available filters and their combinations.

## Basic Repository Search Queries

### 1. Simple term searches
```bash
# Search repositories matching "cli" and "shell" (AND operation)
gh search repos cli shell

# Search repositories matching exact phrase "vim plugin"
gh search repos "vim plugin"

# Search repositories matching "machine learning"
gh search repos "machine learning"

# Search repositories matching "web framework"
gh search repos "web framework"

# Search repositories matching "docker kubernetes"
gh search repos docker kubernetes
```

## Language Filter Examples

### 2. Popular languages
```bash
# Search JavaScript repositories
gh search repos --language=javascript

# Search TypeScript repositories
gh search repos --language=typescript

# Search Python repositories
gh search repos --language=python

# Search Java repositories
gh search repos --language=java

# Search Go repositories
gh search repos --language=go

# Search Rust repositories
gh search repos --language=rust

# Search PHP repositories
gh search repos --language=php

# Search Ruby repositories
gh search repos --language=ruby

# Search Swift repositories
gh search repos --language=swift

# Search Kotlin repositories
gh search repos --language=kotlin
```

### 3. System languages
```bash
# Search C repositories
gh search repos --language=c

# Search C++ repositories
gh search repos --language=cpp

# Search Shell script repositories
gh search repos --language=shell

# Search Dockerfile repositories
gh search repos --language=dockerfile

# Search HTML repositories
gh search repos --language=html

# Search CSS repositories
gh search repos --language=css
```

## Owner Filter Examples

### 4. Organization searches
```bash
# Search repositories owned by Microsoft
gh search repos --owner=microsoft

# Search repositories owned by Google
gh search repos --owner=google

# Search repositories owned by Facebook
gh search repos --owner=facebook

# Search repositories owned by Amazon
gh search repos --owner=amazon

# Search repositories owned by Apache
gh search repos --owner=apache

# Search repositories owned by HashiCorp
gh search repos --owner=hashicorp

# Search repositories owned by Kubernetes
gh search repos --owner=kubernetes

# Search repositories owned by Netflix
gh search repos --owner=netflix

# Search repositories owned by Uber
gh search repos --owner=uber

# Search repositories owned by Airbnb
gh search repos --owner=airbnb
```

### 5. Multiple owners
```bash
# Search repositories from multiple owners
gh search repos --owner=microsoft --owner=google

# Search repositories from tech giants
gh search repos --owner=facebook --owner=amazon

# Search repositories from cloud providers
gh search repos --owner=microsoft --owner=amazon --owner=google

# Search repositories from container ecosystem
gh search repos --owner=kubernetes --owner=docker

# Search repositories from JavaScript ecosystem
gh search repos --owner=nodejs --owner=facebook
```

## Stars Filter Examples

### 6. Star count filters
```bash
# Search repositories with more than 1000 stars
gh search repos --stars=">1000"

# Search repositories with fewer than 100 stars
gh search repos --stars="<100"

# Search repositories with 100-1000 stars
gh search repos --stars="100..1000"

# Search repositories with more than 10000 stars
gh search repos --stars=">10000"

# Search repositories with exactly 500 stars
gh search repos --stars="500"

# Search repositories with more than 50000 stars
gh search repos --stars=">50000"

# Search repositories with 10-50 stars
gh search repos --stars="10..50"

# Search repositories with fewer than 10 stars
gh search repos --stars="<10"

# Search repositories with 1000-5000 stars
gh search repos --stars="1000..5000"

# Search repositories with more than 100000 stars
gh search repos --stars=">100000"
```

## Forks Filter Examples

### 7. Fork count filters
```bash
# Search repositories with more than 100 forks
gh search repos --forks=">100"

# Search repositories with fewer than 10 forks
gh search repos --forks="<10"

# Search repositories with 10-100 forks
gh search repos --forks="10..100"

# Search repositories with more than 1000 forks
gh search repos --forks=">1000"

# Search repositories with exactly 50 forks
gh search repos --forks="50"

# Search repositories with more than 5000 forks
gh search repos --forks=">5000"

# Search repositories with 1-5 forks
gh search repos --forks="1..5"

# Search repositories with no forks
gh search repos --forks="0"

# Search repositories with 100-500 forks
gh search repos --forks="100..500"

# Search repositories with more than 10000 forks
gh search repos --forks=">10000"
```

## Size Filter Examples

### 8. Repository size filters
```bash
# Search repositories larger than 1MB
gh search repos --size=">1000"

# Search repositories smaller than 100KB
gh search repos --size="<100"

# Search repositories between 100KB and 1MB
gh search repos --size="100..1000"

# Search repositories larger than 10MB
gh search repos --size=">10000"

# Search repositories smaller than 50KB
gh search repos --size="<50"

# Search repositories larger than 100MB
gh search repos --size=">100000"

# Search repositories between 1-10MB
gh search repos --size="1000..10000"

# Search small repositories (under 10KB)
gh search repos --size="<10"

# Search medium repositories (1-5MB)
gh search repos --size="1000..5000"

# Search large repositories (over 50MB)
gh search repos --size=">50000"
```

## Topic Filter Examples

### 9. Single topic searches
```bash
# Search repositories with machine-learning topic
gh search repos --topic=machine-learning

# Search repositories with web-development topic
gh search repos --topic=web-development

# Search repositories with docker topic
gh search repos --topic=docker

# Search repositories with kubernetes topic
gh search repos --topic=kubernetes

# Search repositories with react topic
gh search repos --topic=react

# Search repositories with vue topic
gh search repos --topic=vue

# Search repositories with angular topic
gh search repos --topic=angular

# Search repositories with nodejs topic
gh search repos --topic=nodejs

# Search repositories with python topic
gh search repos --topic=python

# Search repositories with javascript topic
gh search repos --topic=javascript
```

### 10. Multiple topic searches
```bash
# Search repositories with unix and terminal topics
gh search repos --topic=unix --topic=terminal

# Search repositories with docker and kubernetes topics
gh search repos --topic=docker --topic=kubernetes

# Search repositories with react and typescript topics
gh search repos --topic=react --topic=typescript

# Search repositories with machine-learning and python topics
gh search repos --topic=machine-learning --topic=python

# Search repositories with web-development and javascript topics
gh search repos --topic=web-development --topic=javascript

# Search repositories with devops and automation topics
gh search repos --topic=devops --topic=automation

# Search repositories with security and cryptography topics
gh search repos --topic=security --topic=cryptography

# Search repositories with api and rest topics
gh search repos --topic=api --topic=rest

# Search repositories with database and sql topics
gh search repos --topic=database --topic=sql

# Search repositories with mobile and android topics
gh search repos --topic=mobile --topic=android
```

## License Filter Examples

### 11. License-based searches
```bash
# Search repositories with MIT license
gh search repos --license=mit

# Search repositories with Apache-2.0 license
gh search repos --license=apache-2.0

# Search repositories with GPL-3.0 license
gh search repos --license=gpl-3.0

# Search repositories with BSD-3-Clause license
gh search repos --license=bsd-3-clause

# Search repositories with ISC license
gh search repos --license=isc

# Search repositories with MPL-2.0 license
gh search repos --license=mpl-2.0

# Search repositories with LGPL-3.0 license
gh search repos --license=lgpl-3.0

# Search repositories with Unlicense
gh search repos --license=unlicense

# Search repositories with GPL-2.0 license
gh search repos --license=gpl-2.0

# Search repositories with BSD-2-Clause license
gh search repos --license=bsd-2-clause
```

### 12. Multiple license searches
```bash
# Search repositories with MIT or Apache licenses
gh search repos --license=mit --license=apache-2.0

# Search repositories with GPL licenses
gh search repos --license=gpl-2.0 --license=gpl-3.0

# Search repositories with BSD licenses
gh search repos --license=bsd-2-clause --license=bsd-3-clause

# Search repositories with permissive licenses
gh search repos --license=mit --license=apache-2.0 --license=isc

# Search repositories with copyleft licenses
gh search repos --license=gpl-3.0 --license=lgpl-3.0
```

## Visibility Filter Examples

### 13. Visibility-based searches
```bash
# Search public repositories only
gh search repos --visibility=public

# Search private repositories (if accessible)
gh search repos --visibility=private

# Search internal repositories (for organizations)
gh search repos --visibility=internal

# Search public repositories in Microsoft org
gh search repos --owner=microsoft --visibility=public

# Search public repositories with React topic
gh search repos --topic=react --visibility=public
```

## Match Filter Examples

### 14. Field-specific searches
```bash
# Search in repository names only
gh search repos "react" --match=name

# Search in repository descriptions only
gh search repos "web framework" --match=description

# Search in README files only
gh search repos "getting started" --match=readme

# Search in names and descriptions
gh search repos "machine learning" --match=name --match=description

# Search in all fields (name, description, readme)
gh search repos "tutorial" --match=name --match=description --match=readme
```

## Date-based Filter Examples

### 15. Created date filters
```bash
# Search repositories created after 2020
gh search repos --created=">2020-01-01"

# Search repositories created before 2018
gh search repos --created="<2018-01-01"

# Search repositories created in 2023
gh search repos --created="2023-01-01..2023-12-31"

# Search repositories created in the last year
gh search repos --created=">2023-01-01"

# Search repositories created this month
gh search repos --created=">2024-12-01"

# Search repositories created between 2020-2022
gh search repos --created="2020-01-01..2022-12-31"

# Search repositories created after 2022
gh search repos --created=">2022-01-01"

# Search repositories created in 2019
gh search repos --created="2019-01-01..2019-12-31"

# Search repositories created before 2020
gh search repos --created="<2020-01-01"

# Search repositories created in Q1 2023
gh search repos --created="2023-01-01..2023-03-31"
```

### 16. Updated date filters
```bash
# Search repositories updated after 2023
gh search repos --updated=">2023-01-01"

# Search repositories updated before 2022
gh search repos --updated="<2022-01-01"

# Search repositories updated in 2023
gh search repos --updated="2023-01-01..2023-12-31"

# Search repositories updated in the last 6 months
gh search repos --updated=">2024-06-01"

# Search repositories updated this year
gh search repos --updated=">2024-01-01"

# Search repositories updated between 2022-2023
gh search repos --updated="2022-01-01..2023-12-31"

# Search repositories updated after 2021
gh search repos --updated=">2021-01-01"

# Search repositories updated in 2020
gh search repos --updated="2020-01-01..2020-12-31"

# Search repositories updated before 2021
gh search repos --updated="<2021-01-01"

# Search repositories updated in the last month
gh search repos --updated=">2024-11-01"
```

## Issue-based Filter Examples

### 17. Good first issues
```bash
# Search repositories with good first issues
gh search repos --good-first-issues=">0"

# Search repositories with many good first issues
gh search repos --good-first-issues=">10"

# Search repositories with few good first issues
gh search repos --good-first-issues="1..5"

# Search repositories with exactly 5 good first issues
gh search repos --good-first-issues="5"

# Search repositories with 10-20 good first issues
gh search repos --good-first-issues="10..20"

# Search repositories with more than 20 good first issues
gh search repos --good-first-issues=">20"

# Search repositories with 2-8 good first issues
gh search repos --good-first-issues="2..8"

# Search repositories with exactly 1 good first issue
gh search repos --good-first-issues="1"

# Search repositories with 5-15 good first issues
gh search repos --good-first-issues="5..15"

# Search repositories with more than 50 good first issues
gh search repos --good-first-issues=">50"
```

### 18. Help wanted issues
```bash
# Search repositories with help wanted issues
gh search repos --help-wanted-issues=">0"

# Search repositories with many help wanted issues
gh search repos --help-wanted-issues=">10"

# Search repositories with few help wanted issues
gh search repos --help-wanted-issues="1..5"

# Search repositories with exactly 3 help wanted issues
gh search repos --help-wanted-issues="3"

# Search repositories with 10-30 help wanted issues
gh search repos --help-wanted-issues="10..30"

# Search repositories with more than 25 help wanted issues
gh search repos --help-wanted-issues=">25"

# Search repositories with 2-8 help wanted issues
gh search repos --help-wanted-issues="2..8"

# Search repositories with exactly 1 help wanted issue
gh search repos --help-wanted-issues="1"

# Search repositories with 5-20 help wanted issues
gh search repos --help-wanted-issues="5..20"

# Search repositories with more than 100 help wanted issues
gh search repos --help-wanted-issues=">100"
```

## Archive and Fork Filter Examples

### 19. Archive status filters
```bash
# Search non-archived repositories only
gh search repos --archived=false

# Search archived repositories only
gh search repos --archived=true

# Search non-archived JavaScript repositories
gh search repos --language=javascript --archived=false

# Search non-archived repositories with React topic
gh search repos --topic=react --archived=false

# Search non-archived repositories in Microsoft org
gh search repos --owner=microsoft --archived=false
```

### 20. Fork inclusion filters
```bash
# Exclude forks from search results
gh search repos --include-forks=false

# Include forks in search results
gh search repos --include-forks=true

# Search only forks
gh search repos --include-forks=only

# Search non-fork JavaScript repositories
gh search repos --language=javascript --include-forks=false

# Search only fork repositories with React topic
gh search repos --topic=react --include-forks=only
```

## Follower and Topic Count Filters

### 21. Follower-based searches
```bash
# Search repositories by users with many followers
gh search repos --followers=">1000"

# Search repositories by users with few followers
gh search repos --followers="<100"

# Search repositories by users with moderate followers
gh search repos --followers="100..1000"

# Search repositories by users with exactly 500 followers
gh search repos --followers="500"

# Search repositories by users with 50-200 followers
gh search repos --followers="50..200"

# Search repositories by users with more than 5000 followers
gh search repos --followers=">5000"

# Search repositories by users with 10-50 followers
gh search repos --followers="10..50"

# Search repositories by users with no followers
gh search repos --followers="0"

# Search repositories by users with 200-500 followers
gh search repos --followers="200..500"

# Search repositories by users with more than 10000 followers
gh search repos --followers=">10000"
```

### 22. Topic count filters
```bash
# Search repositories with many topics
gh search repos --number-topics=">5"

# Search repositories with few topics
gh search repos --number-topics="1..3"

# Search repositories with exactly 2 topics
gh search repos --number-topics="2"

# Search repositories with 3-7 topics
gh search repos --number-topics="3..7"

# Search repositories with more than 10 topics
gh search repos --number-topics=">10"

# Search repositories with no topics
gh search repos --number-topics="0"

# Search repositories with 1-2 topics
gh search repos --number-topics="1..2"

# Search repositories with exactly 5 topics
gh search repos --number-topics="5"

# Search repositories with 4-6 topics
gh search repos --number-topics="4..6"

# Search repositories with more than 15 topics
gh search repos --number-topics=">15"
```

## Complex Combined Filter Examples

### 23. Language + Owner combinations
```bash
# Search JavaScript repositories in Microsoft org
gh search repos --language=javascript --owner=microsoft

# Search Python repositories in Google org
gh search repos --language=python --owner=google

# Search TypeScript repositories in Facebook org
gh search repos --language=typescript --owner=facebook

# Search Go repositories in Kubernetes org
gh search repos --language=go --owner=kubernetes

# Search Rust repositories in Mozilla org
gh search repos --language=rust --owner=mozilla

# Search Java repositories in Apache org
gh search repos --language=java --owner=apache

# Search Swift repositories in Apple org
gh search repos --language=swift --owner=apple

# Search PHP repositories in Laravel org
gh search repos --language=php --owner=laravel

# Search Ruby repositories in Rails org
gh search repos --language=ruby --owner=rails

# Search C++ repositories in Microsoft org
gh search repos --language=cpp --owner=microsoft
```

### 24. Stars + Language combinations
```bash
# Search popular JavaScript repositories (>1000 stars)
gh search repos --language=javascript --stars=">1000"

# Search popular Python repositories (>5000 stars)
gh search repos --language=python --stars=">5000"

# Search emerging TypeScript repositories (100-1000 stars)
gh search repos --language=typescript --stars="100..1000"

# Search popular Go repositories (>2000 stars)
gh search repos --language=go --stars=">2000"

# Search trending Rust repositories (500-2000 stars)
gh search repos --language=rust --stars="500..2000"

# Search popular Java repositories (>3000 stars)
gh search repos --language=java --stars=">3000"

# Search small Swift repositories (<100 stars)
gh search repos --language=swift --stars="<100"

# Search medium PHP repositories (200-1000 stars)
gh search repos --language=php --stars="200..1000"

# Search popular Ruby repositories (>1500 stars)
gh search repos --language=ruby --stars=">1500"

# Search niche C repositories (50-500 stars)
gh search repos --language=c --stars="50..500"
```

### 25. Topic + Stars combinations
```bash
# Search popular machine learning repositories
gh search repos --topic=machine-learning --stars=">1000"

# Search popular React repositories
gh search repos --topic=react --stars=">2000"

# Search trending Docker repositories
gh search repos --topic=docker --stars="500..2000"

# Search popular Vue.js repositories
gh search repos --topic=vue --stars=">1000"

# Search emerging Kubernetes repositories
gh search repos --topic=kubernetes --stars="100..1000"

# Search popular Node.js repositories
gh search repos --topic=nodejs --stars=">1500"

# Search trending Angular repositories
gh search repos --topic=angular --stars="300..1500"

# Search popular Python repositories
gh search repos --topic=python --stars=">2000"

# Search emerging web development repositories
gh search repos --topic=web-development --stars="200..1000"

# Search popular API repositories
gh search repos --topic=api --stars=">500"
```

### 26. Size + Language combinations
```bash
# Search small JavaScript projects (<1MB)
gh search repos --language=javascript --size="<1000"

# Search large Python projects (>10MB)
gh search repos --language=python --size=">10000"

# Search medium TypeScript projects (1-5MB)
gh search repos --language=typescript --size="1000..5000"

# Search tiny Go projects (<500KB)
gh search repos --language=go --size="<500"

# Search large Java projects (>20MB)
gh search repos --language=java --size=">20000"

# Search small Rust projects (<2MB)
gh search repos --language=rust --size="<2000"

# Search medium C++ projects (5-15MB)
gh search repos --language=cpp --size="5000..15000"

# Search small Ruby projects (<1MB)
gh search repos --language=ruby --size="<1000"

# Search large PHP projects (>5MB)
gh search repos --language=php --size=">5000"

# Search tiny Shell projects (<100KB)
gh search repos --language=shell --size="<100"
```

### 27. Date + Activity combinations
```bash
# Search recently created popular repositories
gh search repos --created=">2023-01-01" --stars=">500"

# Search recently updated JavaScript repositories
gh search repos --language=javascript --updated=">2024-01-01"

# Search old but still popular repositories
gh search repos --created="<2020-01-01" --stars=">10000"

# Search recently created machine learning repositories
gh search repos --topic=machine-learning --created=">2023-01-01"

# Search recently updated popular Python repositories
gh search repos --language=python --updated=">2024-01-01" --stars=">1000"

# Search legacy repositories with recent activity
gh search repos --created="<2018-01-01" --updated=">2023-01-01"

# Search new trending repositories
gh search repos --created=">2024-01-01" --stars=">100"

# Search maintained old repositories
gh search repos --created="<2019-01-01" --updated=">2024-01-01"

# Search recently created popular React repositories
gh search repos --topic=react --created=">2023-01-01" --stars=">200"

# Search old popular repositories with recent updates
gh search repos --created="<2017-01-01" --updated=">2023-01-01" --stars=">5000"
```

### 28. License + Language combinations
```bash
# Search MIT licensed JavaScript repositories
gh search repos --language=javascript --license=mit

# Search Apache licensed Python repositories
gh search repos --language=python --license=apache-2.0

# Search GPL licensed C repositories
gh search repos --language=c --license=gpl-3.0

# Search BSD licensed Go repositories
gh search repos --language=go --license=bsd-3-clause

# Search MIT licensed TypeScript repositories
gh search repos --language=typescript --license=mit

# Search Apache licensed Java repositories
gh search repos --language=java --license=apache-2.0

# Search MIT licensed Ruby repositories
gh search repos --language=ruby --license=mit

# Search GPL licensed C++ repositories
gh search repos --language=cpp --license=gpl-3.0

# Search ISC licensed JavaScript repositories
gh search repos --language=javascript --license=isc

# Search Unlicense Rust repositories
gh search repos --language=rust --license=unlicense
```

### 29. Issues + Language combinations
```bash
# Search JavaScript repositories with good first issues
gh search repos --language=javascript --good-first-issues=">5"

# Search Python repositories with help wanted issues
gh search repos --language=python --help-wanted-issues=">10"

# Search TypeScript repositories good for beginners
gh search repos --language=typescript --good-first-issues=">3"

# Search Go repositories needing help
gh search repos --language=go --help-wanted-issues=">5"

# Search Rust repositories with beginner-friendly issues
gh search repos --language=rust --good-first-issues=">2"

# Search Java repositories with many help wanted issues
gh search repos --language=java --help-wanted-issues=">15"

# Search Ruby repositories good for first contributions
gh search repos --language=ruby --good-first-issues=">4"

# Search PHP repositories needing contributors
gh search repos --language=php --help-wanted-issues=">8"

# Search Swift repositories with beginner issues
gh search repos --language=swift --good-first-issues=">1"

# Search C repositories with help wanted issues
gh search repos --language=c --help-wanted-issues=">3"
```

### 30. Complex multi-filter searches
```bash
# Search popular, recently updated JavaScript repositories with MIT license
gh search repos --language=javascript --stars=">1000" --updated=">2024-01-01" --license=mit

# Search small, new Python machine learning repositories
gh search repos --language=python --topic=machine-learning --created=">2023-01-01" --size="<5000"

# Search active TypeScript repositories good for beginners
gh search repos --language=typescript --updated=">2024-01-01" --good-first-issues=">3" --archived=false

# Search popular Docker repositories with many topics
gh search repos --topic=docker --stars=">500" --number-topics=">3" --archived=false

# Search recent Go repositories by popular developers
gh search repos --language=go --created=">2023-01-01" --followers=">500" --include-forks=false

# Search maintained React repositories with good documentation
gh search repos --topic=react --updated=">2024-01-01" --match=readme --archived=false

# Search large, popular Python repositories with Apache license
gh search repos --language=python --size=">10000" --stars=">2000" --license=apache-2.0

# Search new TypeScript repositories with good first issues and help wanted
gh search repos --language=typescript --created=">2024-01-01" --good-first-issues=">1" --help-wanted-issues=">1"

# Search popular, well-maintained JavaScript libraries
gh search repos --language=javascript --stars=">5000" --updated=">2024-01-01" --archived=false --include-forks=false

# Search niche Rust repositories with active communities
gh search repos --language=rust --stars="100..1000" --updated=">2023-06-01" --good-first-issues=">0" --help-wanted-issues=">0"
```

## Sorting and Limiting Examples

### 31. Sorting options
```bash
# Search repositories sorted by stars (descending)
gh search repos machine learning --sort=stars --order=desc

# Search repositories sorted by forks (ascending)
gh search repos web framework --sort=forks --order=asc

# Search repositories sorted by update date
gh search repos react --sort=updated --order=desc

# Search repositories sorted by help wanted issues
gh search repos python --sort=help-wanted-issues --order=desc

# Search repositories with best match (default)
gh search repos javascript framework --sort=best-match
```

### 32. Limit variations
```bash
# Search for top 10 repositories
gh search repos popular javascript --limit=10

# Search for top 50 repositories
gh search repos machine learning --limit=50

# Search for top 100 repositories (maximum)
gh search repos web development --limit=100

# Search for top 5 repositories (quick overview)
gh search repos rust cli --limit=5

# Search for top 25 repositories
gh search repos docker container --limit=25
```

## Notes

- Repository search uses AND operation for multiple terms by default
- Use quotes for exact phrase matching
- Filters can be combined for precise targeting
- Date formats: YYYY-MM-DD or comparison operators (>, <, ranges)
- Number formats support comparison operators and ranges
- Default sort is by best match unless specified
- Maximum limit is 100 repositories per search
- Some filters may not work with private repositories depending on access
- Archive status and fork inclusion help filter active projects
- Topic searches are case-sensitive and use kebab-case format