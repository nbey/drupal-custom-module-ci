# Requirements

- NodeJS


# Usage
```
name: Custom Module CI/CD

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: quay.io/pantheon-public/build-tools-ci:8.x-php8.2
      options: --user root
      env:
        SIMPLETEST_DB: mysql://root:root@mysql:3306/drupal_test
        SIMPLETEST_BASE_URL: http://localhost:80
        XDEBUG_MODE: coverage 

    services:
      mysql:
        image: mysql:5.7
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: drupal_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping --silent"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - name: Run Drupal Testing Action
        uses: nbey/drupal-custom-module-ci@main
        with:
          module_name: drupal-module
          module_vendor: nbey
          repo_name: "drupal-module"
          repo_org: "nbey"
          # Format for referencing GH branch commit is dev-BRANCH_NAME#SHA
          repo_ref: "dev-${{ github.head_ref || github.ref_name }}#${{ github.sha }}"
          composer_gh_pat: ${{ secrets.COMPOSER_PAT }}
          composer_repositories: |
            - drupal-module-repo

```
