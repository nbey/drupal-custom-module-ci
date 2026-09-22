<?php

declare(strict_types=1);

namespace Drupal\Tests\drupal_custom_module_ci_fixture\Functional;

use Drupal\Tests\BrowserTestBase;

final class SmokeTest extends BrowserTestBase {

  protected static $modules = ['drupal_custom_module_ci_fixture'];

  protected $defaultTheme = 'stark';

  public function testFixtureModuleSmokeTest(): void {
    self::assertTrue($this->container->get('module_handler')->moduleExists('drupal_custom_module_ci_fixture'));

    $this->drupalGet('');
    $this->assertSession()->statusCodeEquals(200);
  }

}