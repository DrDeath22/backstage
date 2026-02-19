/**
 * Initial database schema for ConanCrates.
 * Mirrors the Django models from packages/models/.
 *
 * Note: Package-level metadata (name, description, tags, etc.) lives in the
 * Backstage catalog as entities. These tables store registry-specific data
 * that the catalog can't model: versions, binaries, files, dependency graphs.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // Package versions (links to catalog entity via entityRef)
  await knex.schema.createTable('conancrates_package_versions', table => {
    table.increments('id').primary();
    table.string('entity_ref', 255).notNullable().index();
    table.string('version', 100).notNullable().index();
    table.string('recipe_revision', 64).defaultTo('');
    table.text('recipe_content').defaultTo('');
    table.string('recipe_file_path', 500).defaultTo('');
    table.string('conan_version', 50).defaultTo('');
    table.string('uploaded_by', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['entity_ref', 'version']);
  });

  // Binary packages (compiled artifacts for specific platform configs)
  await knex.schema.createTable('conancrates_binary_packages', table => {
    table.increments('id').primary();
    table
      .integer('package_version_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('conancrates_package_versions')
      .onDelete('CASCADE');
    table.string('package_id', 64).notNullable().unique().index();
    table.string('os', 50).defaultTo('');
    table.string('arch', 50).defaultTo('');
    table.string('compiler', 50).defaultTo('');
    table.string('compiler_version', 50).defaultTo('');
    table.string('build_type', 50).defaultTo('');
    table.json('options').defaultTo('{}');
    table.json('dependency_graph').defaultTo('{}');
    table.string('binary_file_path', 500).defaultTo('');
    table.string('rust_crate_file_path', 500).defaultTo('');
    table.bigInteger('file_size').defaultTo(0);
    table.string('sha256', 64).defaultTo('');
    table.integer('download_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Dependencies between package versions
  await knex.schema.createTable('conancrates_dependencies', table => {
    table.increments('id').primary();
    table
      .integer('package_version_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('conancrates_package_versions')
      .onDelete('CASCADE');
    table.string('requires_entity_ref', 255).notNullable();
    table.string('version_requirement', 100).defaultTo('');
    table
      .string('dependency_type', 20)
      .defaultTo('requires')
      .checkIn(['requires', 'build_requires', 'test_requires']);
    table.unique([
      'package_version_id',
      'requires_entity_ref',
      'dependency_type',
    ]);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('conancrates_dependencies');
  await knex.schema.dropTableIfExists('conancrates_binary_packages');
  await knex.schema.dropTableIfExists('conancrates_package_versions');
};
