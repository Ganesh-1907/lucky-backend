import db from './src/config/database';

async function main() {
  const sections = await db.query.homepageSections.findMany();
  console.log('SECTIONS IN DB:', sections);
  
  if (sections.length === 0) {
    console.log('Database has no sections.');
  }
}

main().catch(console.error);
