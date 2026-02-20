/**
 * Add rich metadata columns to package_versions.
 * These are parsed from conanfile.py on upload and stored for display/search.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('conancrates_package_versions', table => {
    table.text('description').defaultTo('');
    table.string('license', 255).defaultTo('');
    table.string('author', 255).defaultTo('');
    table.string('homepage', 500).defaultTo('');
    table.string('topics', 500).defaultTo('');
    table.text('readme_content').defaultTo('');
    table.text('security_notes').defaultTo('');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('conancrates_package_versions', table => {
    table.dropColumn('description');
    table.dropColumn('license');
    table.dropColumn('author');
    table.dropColumn('homepage');
    table.dropColumn('topics');
    table.dropColumn('readme_content');
    table.dropColumn('security_notes');
  });
};
