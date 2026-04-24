import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { migrateUp, migrateDown, migrateStatus } from './migrator';

async function main() {
  const command = process.argv[2] ?? 'up';

  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'loanlight',
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    logging: false,
  });

  try {
    if (command === 'down') await migrateDown(sequelize);
    else if (command === 'status') await migrateStatus(sequelize);
    else await migrateUp(sequelize);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
