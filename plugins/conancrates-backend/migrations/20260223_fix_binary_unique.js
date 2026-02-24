/**
 * Fix binary packages unique constraint.
 * The package_id column had a global unique constraint, which prevented the
 * same package_id (build profile hash) from being used across multiple versions.
 * Replace it with a composite unique on (package_version_id, package_id) so
 * the same build profile can appear in different versions independently.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // SQLite doesn't support dropping individual unique constraints via alterTable,
  // so we recreate the table with the correct constraint.
  const isSqlite = knex.client.config.client === 'sqlite3' || knex.client.config.client === 'better-sqlite3';

  if (isSqlite) {
    // Rename old table, create new one, copy data, drop old.
    await knex.schema.renameTable('conancrates_binary_packages', 'conancrates_binary_packages_old');

    await knex.schema.createTable('conancrates_binary_packages', table => {
      table.increments('id').primary();
      table
        .integer('package_version_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('conancrates_package_versions')
        .onDelete('CASCADE');
      table.string('package_id', 64).notNullable();
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
      table.unique(['package_version_id', 'package_id']);
    });

    await knex.raw(`
      INSERT INTO conancrates_binary_packages
        (id, package_version_id, package_id, os, arch, compiler, compiler_version,
         build_type, options, dependency_graph, binary_file_path, rust_crate_file_path,
         file_size, sha256, download_count, created_at)
      SELECT
        id, package_version_id, package_id, os, arch, compiler, compiler_version,
        build_type, options, dependency_graph, binary_file_path, rust_crate_file_path,
        file_size, sha256, download_count, created_at
      FROM conancrates_binary_packages_old
    `);

    await knex.schema.dropTable('conancrates_binary_packages_old');
  } else {
    // For Postgres etc. — drop the old unique index and add composite one.
    await knex.schema.alterTable('conancrates_binary_packages', table => {
      table.dropUnique(['package_id']);
      table.unique(['package_version_id', 'package_id']);
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const isSqlite = knex.client.config.client === 'sqlite3' || knex.client.config.client === 'better-sqlite3';

  if (isSqlite) {
    await knex.schema.renameTable('conancrates_binary_packages', 'conancrates_binary_packages_new');

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

    await knex.raw(`
      INSERT INTO conancrates_binary_packages
        (id, package_version_id, package_id, os, arch, compiler, compiler_version,
         build_type, options, dependency_graph, binary_file_path, rust_crate_file_path,
         file_size, sha256, download_count, created_at)
      SELECT
        id, package_version_id, package_id, os, arch, compiler, compiler_version,
        build_type, options, dependency_graph, binary_file_path, rust_crate_file_path,
        file_size, sha256, download_count, created_at
      FROM conancrates_binary_packages_new
    `);

    await knex.schema.dropTable('conancrates_binary_packages_new');
  } else {
    await knex.schema.alterTable('conancrates_binary_packages', table => {
      table.dropUnique(['package_version_id', 'package_id']);
      table.unique(['package_id']);
    });
  }
};
