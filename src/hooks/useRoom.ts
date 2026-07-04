import { useCallback, useEffect, useState } from 'react'
import { db, type Reaction, type Room, type UserProfile } from '../services/db'

/** Kullanıcının oda listesi (elle tazelenebilir + optimistic yazılabilir). */
export function useRooms(uid: string) {
  const [rooms, setRooms] = useState<Room[] | null>(null)

  const refresh = useCallback(() => {
    db.listRooms(uid)
      .then(setRooms)
      .catch(() => setRooms([]))
  }, [uid])

  /** Bilinen sonucu ağ beklemeden uygula (kur/katıl/ayrıl sonrası anında
   *  ekran geçişi); ardından arka planda gerçek listeyle doğrulanır. */
  const setKnown = useCallback(
    (known: Room[]) => {
      setRooms(known)
      void db
        .listRooms(uid)
        .then(setRooms)
        .catch(() => {})
    },
    [uid],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return { rooms, refresh, setKnown }
}

/** Seçili odanın belgesi + üyeleri + tepkilerinin canlı akışı. */
export function useRoom(roomId: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<UserProfile[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])

  useEffect(() => db.subscribeRoom(roomId, setRoom), [roomId])
  useEffect(() => db.subscribeReactions(roomId, setReactions), [roomId])

  // Üye listesi değişince dinleyicileri yeniden kur
  const memberKey = room?.memberUids.join(',') ?? ''
  useEffect(() => {
    if (!memberKey) {
      setMembers([])
      return
    }
    return db.subscribeMembers(memberKey.split(','), setMembers)
  }, [memberKey])

  return { room, members, reactions }
}
