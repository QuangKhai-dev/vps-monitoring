import { getPool } from '@/lib/db';

export interface IUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = IUser & {
  save: () => Promise<void>;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin';
  created_at: Date;
  updated_at: Date;
};

function rowToUser(row: UserRow): IUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asDocument(user: IUser): UserDocument {
  return {
    ...user,
    async save() {
      const pool = await getPool();
      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [user.passwordHash, user.id]
      );
    },
  };
}

export const User = {
  async countDocuments(): Promise<number> {
    const pool = await getPool();
    const r = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
    return Number(r.rows[0]?.count ?? 0);
  },

  async findOne(filter: { username: string }): Promise<UserDocument | null> {
    const pool = await getPool();
    const r = await pool.query<UserRow>(
      'SELECT * FROM users WHERE username = $1 LIMIT 1',
      [filter.username.toLowerCase()]
    );
    const row = r.rows[0];
    return row ? asDocument(rowToUser(row)) : null;
  },

  async findById(id: string): Promise<UserDocument | null> {
    const pool = await getPool();
    const r = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    const row = r.rows[0];
    return row ? asDocument(rowToUser(row)) : null;
  },

  async create(data: {
    username: string;
    passwordHash: string;
    role: 'admin';
  }): Promise<UserDocument> {
    const pool = await getPool();
    const r = await pool.query<UserRow>(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.username.toLowerCase(), data.passwordHash, data.role]
    );
    return asDocument(rowToUser(r.rows[0]));
  },
};
