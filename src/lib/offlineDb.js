import { openDB } from 'idb'

const DB_NAME = 'truckerbook-offline'
const DB_VERSION = 1

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('status', 'status')
          store.createIndex('created_at', 'created_at')
        }
        if (!db.objectStoreNames.contains('cached_data')) {
          db.createObjectStore('cached_data', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export async function addToSyncQueue(table, action, data) {
  const db = await getDb()
  const entry = {
    table,
    action,
    data,
    created_at: Date.now(),
    status: 'pending',
    retries: 0,
  }
  const id = await db.add('sync_queue', entry)
  return { ...entry, id }
}

export async function getPendingItems() {
  const db = await getDb()
  const all = await db.getAllFromIndex('sync_queue', 'status', 'pending')
  return all.sort((a, b) => a.created_at - b.created_at)
}

export async function updateSyncItem(id, updates) {
  const db = await getDb()
  const item = await db.get('sync_queue', id)
  if (!item) return
  Object.assign(item, updates)
  await db.put('sync_queue', item)
}

export async function clearSyncedItems() {
  const db = await getDb()
  const synced = await db.getAllFromIndex('sync_queue', 'status', 'synced')
  const tx = db.transaction('sync_queue', 'readwrite')
  for (const item of synced) {
    await tx.store.delete(item.id)
  }
  await tx.done
}

export async function getPendingCount() {
  const db = await getDb()
  const items = await db.getAllFromIndex('sync_queue', 'status', 'pending')
  return items.length
}

export async function setCachedData(key, value) {
  const db = await getDb()
  await db.put('cached_data', { key, value, updated_at: Date.now() })
}

export async function getCachedData(key) {
  const db = await getDb()
  const entry = await db.get('cached_data', key)
  return entry?.value ?? null
}
