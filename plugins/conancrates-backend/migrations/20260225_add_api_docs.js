/**
 * Add API documentation tracking columns to package_versions.
 * Docs are generated server-side from C++ headers using Poxy/Doxygen.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('conancrates_package_versions', table => {
    table.string('api_docs_path', 500).defaultTo('');
    table.string('api_docs_status', 20).defaultTo('');
    table.text('api_docs_error').defaultTo('');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('conancrates_package_versions', table => {
    table.dropColumn('api_docs_path');
    table.dropColumn('api_docs_status');
    table.dropColumn('api_docs_error');
  });
};
