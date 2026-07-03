import { useCallback, useEffect, useState } from 'react'
import { db, type Room, type UserProfile } from '../services/db'

/** Kullanıcının oda listesi (elle tazelenebilir). */
export function useRooms(uid: string) {
  const [rooms, setRooms] = useState<Room[] | null>(null)

  const refresh = useCallback(() => {
    db.listRooms(uid)
      .then(setRooms)
      .catch(() => setRooms([]))
  }, [uid])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { rooms, refresh }
}

/** Seçili odanın belgesi + üyelerinin canlı akışı (scoreboard). */
export function useRoom(roomId: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<UserProfile[]>([])

  useEffect(() => db.subscribeRoom(roomId, setRoom), [roomId])

  // Üye listesi değişince dinleyicileri yeniden kur
  const memberKey = room?.memberUids.join(',') ?? ''
  useEffect(() => {
    if (!memberKey) {
      setMembers([])
      return
    }
    return db.subscribeMembers(memberKey.split(','), setMembers)
  }, [memberKey])

  return { room, members }
}
