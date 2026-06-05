import { dbClient } from "../DatabaseClient";

// this is the user object in which the data is stored in the database
export interface User {
    id: string;
    employee_id: string;
    full_name: string;
    role: string;
    status: string;
    enrolled_at: number;
    updated_at: number;
    sync_status: string;
}

export class UserRepository {
    // save a new user to the databse
    /*
    static aysnc createUser()-> insert the new user into the database
    args :  user : User interface object
    returns : Promise<void>
    */

    static async createUser(user: User) {
        try {
            const db = dbClient.getDb();

            const statement = `
              INSERT INTO users (id, employee_id, full_name, role, status, enrolled_at, updated_at, sync_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await db.execute(statement, [
                user.id,
                user.employee_id,
                user.full_name,
                user.role,
                user.status,
                user.enrolled_at,
                user.updated_at,
                user.sync_status,
            ]);
        } catch (error) {
            console.error("Error in creating user : ", error);
            throw error;
        }
    }



    // fetch user data by id
    /*
    static aysnc getUserById(userId) -> fetch user data from database by id 
    args : userId 
    returns Promise<User|null> 
    */

    static async getUserById(id: string): Promise<User | null> {
        try {
            const db = dbClient.getDb();

            const result = await db.execute("SELECT * FROM users WHERE id = ?", [id]);
            if (result.rows && result.rows.length > 0) {
                return result.rows?.[0] as unknown as User;
            }

            return null;
        } catch (error) {
            console.error("Error in getting user by id : ", error);
            throw error;
        }
    }

    static async getUserByEmployeeId(employeeId: string): Promise<User | null> {
        try {
            const db = dbClient.getDb();

            const result = await db.execute('SELECT * FROM users WHERE employee_id = ? LIMIT 1', [employeeId]);
            if (result.rows && result.rows.length > 0) {
                return result.rows?.[0] as unknown as User;
            }

            return null;
        } catch (error) {
            console.error('Error in getting user by employee id : ', error);
            throw error;
        }
    }

    static async getAllUsers(limit = 100): Promise<User[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            'SELECT * FROM users ORDER BY enrolled_at DESC LIMIT ?',
            [limit]
        );
        return (result.rows ?? []) as unknown as User[];
    }

    static async updateStatus(id: string, status: User['status']): Promise<void> {
        const db = dbClient.getDb();
        await db.execute(
            'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
            [status, Date.now(), id]
        );
    }

    static async deleteUser(id: string): Promise<void> {
        const db = dbClient.getDb();
        await db.execute('DELETE FROM users WHERE id = ?', [id]);
    }
}
