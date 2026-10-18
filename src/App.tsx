import { useCallback, useEffect, useRef, useState } from 'react'

type GameState = 'idle' | 'crossing' | 'caught' | 'playing' | 'gameover' | 'won'
type MenuPanel = 'profile' | 'character' | 'options' | 'achievements' | 'help' | 'showcase' | null
type Difficulty = 'normal' | 'relaxed' | 'extreme'
type CharacterChoice = 'girl' | 'boy'
type PlayerSex = 'female' | 'male'
type ProfileStep = 'list' | 'username' | 'age' | 'sex'
type PlayerProfile = {
  id: string
  username: string
  age: number
  sex: PlayerSex
}
type RunRecord = {
  id: number
  timeMs: number
  money: number
  playerId?: string
  playerName?: string
}
type Hazard = {
  x: number
  y: number
  width: number
  height: number
  kind: 'car' | 'jeepney'
  color: string
  speedBoost: number
}

type Coin = {
  x: number
  y: number
  collected: boolean
}

type CrossingCar = {
  x: number
  y: number
  width: number
  speed: number
  color: string
  jeepney?: boolean
}

const WIDTH = 960
const HEIGHT = 560
const ROAD_LEFT = 190
const ROAD_RIGHT = 770
const PLAYER_Y = 394
const RUNNER_W = 34
const RUNNER_H = 62
const CAR_W = 50
const CAR_H = 84
const lanes = [255, 370, 485, 600, 715]
const carColors = ['#ef5d4b', '#f6c84c', '#36a7a3', '#8f77bd', '#eae5d1']

const loadRunHistory = (): RunRecord[] => {
  try {
    return JSON.parse(localStorage.getItem('road-rush-runs') || '[]') as RunRecord[]
  } catch {
    return []
  }
}

const loadProfiles = (): PlayerProfile[] => {
  try {
    return (JSON.parse(localStorage.getItem('road-rush-profiles') || '[]') as PlayerProfile[]).slice(0, 3)
  } catch {
    return []
  }
}

const formatFinishTime = (timeMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const createCrossingCars = (): CrossingCar[] => [
  { x: -80, y: 112, width: 92, speed: 3.2, color: '#ef5d4b' },
  { x: 390, y: 112, width: 92, speed: 3.2, color: '#d8a343' },
  { x: 180, y: 178, width: 88, speed: -2.7, color: '#70c6dc' },
  { x: 720, y: 178, width: 88, speed: -2.7, color: '#bd7868' },
  { x: 30, y: 244, width: 124, speed: 2.2, color: '#1768b7', jeepney: true },
  { x: 590, y: 244, width: 124, speed: 2.2, color: '#1768b7', jeepney: true },
  { x: 300, y: 330, width: 92, speed: -3.5, color: '#f2c846' },
  { x: 830, y: 330, width: 92, speed: -3.5, color: '#73ac7c' },
  { x: -20, y: 396, width: 90, speed: 2.8, color: '#a98bd1' },
  { x: 500, y: 396, width: 90, speed: 2.8, color: '#d98770' },
]

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const keysRef = useRef({ left: false, right: false })
  const runStartRef = useRef<number | null>(null)
  const difficultyRef = useRef<Difficulty>((localStorage.getItem('road-rush-difficulty') as Difficulty) || 'normal')
  const characterRef = useRef<CharacterChoice>((localStorage.getItem('road-rush-character') as CharacterChoice) || 'girl')
  const activeProfileRef = useRef<string | null>(localStorage.getItem('road-rush-active-profile'))
  const gameRef = useRef({
    state: 'idle' as GameState,
    playerX: 468,
    officerX: 468,
    hazards: [] as Hazard[],
    coins: [] as Coin[],
    distance: 0,
    speed: 4.4,
    spawnTimer: 60,
    roadOffset: 0,
    stage: 1,
    wallet: 150,
    timeLeft: 120,
    invulnerable: 0,
    penaltyFlash: 0,
  })
  const crossingRef = useRef({
    playerX: 716,
    playerY: 484,
    cars: createCrossingCars(),
    hitFlash: 0,
  })

  const [gameState, setGameState] = useState<GameState>('idle')
  const [score, setScore] = useState(0)
  const [stage, setStage] = useState(1)
  const [wallet, setWallet] = useState(150)
  const [timeLeft, setTimeLeft] = useState(120)
  const [best, setBest] = useState(() => Number(localStorage.getItem('gridlock-best') || 0))
  const [menuPanel, setMenuPanel] = useState<MenuPanel>(() => (loadProfiles().length === 0 ? 'profile' : null))
  const [difficulty, setDifficulty] = useState<Difficulty>(difficultyRef.current)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterChoice>(characterRef.current)
  const [runHistory, setRunHistory] = useState<RunRecord[]>(loadRunHistory)
  const [profiles, setProfiles] = useState<PlayerProfile[]>(loadProfiles)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const savedId = localStorage.getItem('road-rush-active-profile')
    const savedProfiles = loadProfiles()
    return savedProfiles.some((profile) => profile.id === savedId) ? savedId : savedProfiles[0]?.id || null
  })
  const [profileDraft, setProfileDraft] = useState({ username: '', age: '', sex: 'female' as PlayerSex })
  const [profileStep, setProfileStep] = useState<ProfileStep>(() =>
    loadProfiles().length === 0 ? 'username' : 'list',
  )

  const startGame = useCallback(() => {
    const baseSpeed = difficultyRef.current === 'relaxed' ? 3.7 : difficultyRef.current === 'extreme' ? 5.4 : 4.4
    gameRef.current = {
      state: 'playing',
      playerX: 468,
      officerX: 468,
      hazards: [],
      coins: [],
      distance: 0,
      speed: baseSpeed,
      spawnTimer: 75,
      roadOffset: 0,
      stage: 1,
      wallet: 150,
      timeLeft: 120,
      invulnerable: 0,
      penaltyFlash: 0,
    }
    setScore(0)
    setStage(1)
    setWallet(150)
    setTimeLeft(120)
    setGameState('playing')
  }, [])

  const startCrossing = useCallback(() => {
    crossingRef.current = {
      playerX: 716,
      playerY: 484,
      cars: createCrossingCars(),
      hitFlash: 0,
    }
    gameRef.current.state = 'crossing'
    runStartRef.current = Date.now()
    setMenuPanel(null)
    setGameState('crossing')
  }, [])

  const moveCrossingPlayer = useCallback((dx: number, dy: number) => {
    if (gameRef.current.state !== 'crossing') return
    const crossing = crossingRef.current
    crossing.playerX = Math.max(12, Math.min(WIDTH - RUNNER_W - 12, crossing.playerX + dx))
    crossing.playerY = Math.max(42, Math.min(HEIGHT - RUNNER_H - 10, crossing.playerY + dy))
    if (crossing.playerY <= 46) {
      gameRef.current.state = 'caught'
      setGameState('caught')
    }
  }, [])

  const setSteering = useCallback((direction: 'left' | 'right', active: boolean) => {
    keysRef.current[direction] = active
  }, [])

  const goHome = useCallback(() => {
    keysRef.current.left = false
    keysRef.current.right = false
    gameRef.current.state = 'idle'
    gameRef.current.hazards = []
    gameRef.current.coins = []
    setMenuPanel(null)
    setGameState('idle')
  }, [])

  const changeDifficulty = useCallback((nextDifficulty: Difficulty) => {
    difficultyRef.current = nextDifficulty
    setDifficulty(nextDifficulty)
    localStorage.setItem('road-rush-difficulty', nextDifficulty)
  }, [])

  const chooseCharacter = useCallback((character: CharacterChoice) => {
    characterRef.current = character
    setSelectedCharacter(character)
    localStorage.setItem('road-rush-character', character)
  }, [])

  const selectProfile = useCallback((profileId: string) => {
    activeProfileRef.current = profileId
    setActiveProfileId(profileId)
    localStorage.setItem('road-rush-active-profile', profileId)
  }, [])

  const createProfile = useCallback(() => {
    const username = profileDraft.username.trim()
    const age = Number(profileDraft.age)
    if (!username || !Number.isInteger(age) || age < 5 || age > 99 || profiles.length >= 3) return
    const profile: PlayerProfile = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      username: username.slice(0, 14),
      age,
      sex: profileDraft.sex,
    }
    const nextProfiles = [...profiles, profile]
    setProfiles(nextProfiles)
    localStorage.setItem('road-rush-profiles', JSON.stringify(nextProfiles))
    selectProfile(profile.id)
    setProfileDraft({ username: '', age: '', sex: 'female' })
    if (profiles.length === 0) setMenuPanel(null)
    else setProfileStep('list')
  }, [profileDraft, profiles, selectProfile])

  const deleteProfile = useCallback((profileId: string) => {
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId)
    setProfiles(nextProfiles)
    localStorage.setItem('road-rush-profiles', JSON.stringify(nextProfiles))
    if (activeProfileRef.current === profileId) {
      const nextActiveId = nextProfiles[0]?.id || null
      activeProfileRef.current = nextActiveId
      setActiveProfileId(nextActiveId)
      if (nextActiveId) localStorage.setItem('road-rush-active-profile', nextActiveId)
      else localStorage.removeItem('road-rush-active-profile')
    }
    if (nextProfiles.length === 0) {
      setProfileDraft({ username: '', age: '', sex: 'female' })
      setProfileStep('username')
      setMenuPanel('profile')
    }
  }, [profiles])

  const beginFromHome = useCallback(() => {
    if (!activeProfileRef.current || !loadProfiles().some((profile) => profile.id === activeProfileRef.current)) {
      setProfileStep(loadProfiles().length === 0 ? 'username' : 'list')
      setMenuPanel('profile')
      return
    }
    startCrossing()
  }, [startCrossing])

  useEffect(() => {
    activeProfileRef.current = activeProfileId
    if (activeProfileId) localStorage.setItem('road-rush-active-profile', activeProfileId)
  }, [activeProfileId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (gameRef.current.state === 'crossing' && !event.repeat) {
        const crossingMoves: Record<string, [number, number]> = {
          ArrowUp: [0, -42],
          KeyW: [0, -42],
          ArrowDown: [0, 42],
          KeyS: [0, 42],
          ArrowLeft: [-42, 0],
          KeyA: [-42, 0],
          ArrowRight: [42, 0],
          KeyD: [42, 0],
        }
        const move = crossingMoves[event.code]
        if (move) {
          event.preventDefault()
          moveCrossingPlayer(move[0], move[1])
          return
        }
      }
      if (['ArrowLeft', 'KeyA'].includes(event.code)) {
        event.preventDefault()
        keysRef.current.left = true
      }
      if (['ArrowRight', 'KeyD'].includes(event.code)) {
        event.preventDefault()
        keysRef.current.right = true
      }
      if ((event.code === 'Enter' || event.code === 'Space') && gameRef.current.state !== 'playing') {
        event.preventDefault()
        if (gameRef.current.state === 'idle') startCrossing()
        else if (gameRef.current.state === 'caught') startGame()
        else startCrossing()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'KeyA'].includes(event.code)) keysRef.current.left = false
      if (['ArrowRight', 'KeyD'].includes(event.code)) keysRef.current.right = false
    }
    const clearKeys = () => {
      keysRef.current.left = false
      keysRef.current.right = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearKeys)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
    }
  }, [moveCrossingPlayer, startCrossing, startGame])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.imageSmoothingEnabled = false
    const introGirl = new Image()
    const introBoy = new Image()
    let introGirlReady = false
    let introBoyReady = false
    introGirl.onload = () => {
      introGirlReady = introGirl.naturalWidth > 0 && introGirl.naturalHeight > 0
    }
    introGirl.onerror = () => {
      introGirlReady = false
    }
    introBoy.onload = () => {
      introBoyReady = introBoy.naturalWidth > 0 && introBoy.naturalHeight > 0
    }
    introBoy.onerror = () => {
      introBoyReady = false
    }
    introGirl.src = '/sanciangko-mascot-front.png'
    introBoy.src = '/sanciangko-mascot-boy-front.png'

    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }

    const text = (value: string, x: number, y: number, color: string, size = 12, align: CanvasTextAlign = 'left') => {
      ctx.fillStyle = color
      ctx.font = `${size}px "Press Start 2P", monospace`
      ctx.textAlign = align
      ctx.fillText(value, x, y)
    }

    const drawIntro = (time: number) => {
      rect(0, 0, WIDTH, HEIGHT, '#159bea')
      rect(0, 140, WIDTH, 170, '#2da9e9')

      const cloudShift = (time / 130) % 80
      const cloud = (x: number, y: number, scale: number) => {
        rect(x, y + 18 * scale, 110 * scale, 24 * scale, '#e9f8f1')
        rect(x + 12 * scale, y + 7 * scale, 32 * scale, 30 * scale, '#f8fff5')
        rect(x + 45 * scale, y, 42 * scale, 39 * scale, '#f8fff5')
        rect(x + 79 * scale, y + 12 * scale, 44 * scale, 28 * scale, '#eef9f1')
      }
      cloud(-18 + cloudShift * 0.08, 42, 0.8)
      cloud(775 - cloudShift * 0.06, 58, 0.7)

      rect(0, 227, WIDTH, 157, '#60aa69')
      for (let x = 0; x < WIDTH; x += 64) {
        const h = 45 + ((x / 64) % 4) * 15
        rect(x, 227 - h, 48, h + 95, x % 128 === 0 ? '#e0c68f' : '#cfaa79')
        rect(x + 6, 237 - h, 36, 9, '#efe0b6')
        for (let wy = 252 - h; wy < 220; wy += 18) {
          rect(x + 8, wy, 8, 9, '#4f8294')
          rect(x + 27, wy, 8, 9, '#4f8294')
        }
      }
      for (let x = -20; x < WIDTH; x += 72) {
        rect(x, 287, 82, 96, '#278153')
        rect(x + 15, 270, 48, 113, '#3c9b60')
        rect(x + 29, 253, 22, 130, '#50ad6c')
      }

      rect(0, 383, WIDTH, 33, '#c8bea8')
      rect(0, 416, WIDTH, 144, '#3b4d67')
      rect(0, 421, WIDTH, 8, '#e7e2cc')
      for (let x = -20; x < WIDTH; x += 110) rect(x, 521, 62, 7, '#f0e5c8')

      rect(783, 184, 151, 56, '#143f58')
      rect(789, 190, 139, 44, '#e7f0e5')
      rect(795, 196, 127, 32, '#174d66')
      text('CEBU CITY', 859, 218, '#fff8df', 10, 'center')
      rect(805, 240, 8, 54, '#453d33')
      rect(908, 240, 8, 54, '#453d33')

      rect(195, 488, 700, 29, 'rgba(24,31,42,0.38)')
      rect(204, 275, 676, 190, '#132d4b')
      rect(220, 286, 642, 169, '#1769b8')
      rect(191, 253, 646, 43, '#a71f2e')
      rect(204, 242, 620, 44, '#ef383b')
      rect(218, 271, 605, 10, '#ffd33f')
      rect(235, 299, 144, 75, '#173e63')
      rect(246, 309, 50, 52, '#8ed1e2')
      rect(308, 309, 58, 52, '#8ed1e2')
      rect(394, 301, 303, 139, '#102f51')
      rect(709, 296, 128, 86, '#173e63')
      rect(722, 307, 48, 61, '#8ed1e2')
      rect(779, 307, 45, 61, '#8ed1e2')
      rect(227, 382, 624, 22, '#f4c83f')
      rect(236, 409, 600, 35, '#1486d0')
      rect(231, 447, 626, 14, '#d8ddd9')
      rect(190, 430, 38, 43, '#d8ddd9')
      rect(855, 412, 35, 59, '#d8ddd9')
      rect(830, 278, 31, 19, '#ffb735')

      rect(247, 421, 116, 87, '#17232f')
      rect(268, 438, 76, 76, '#222b35')
      rect(291, 461, 31, 31, '#c5c8c4')
      rect(302, 470, 10, 12, '#f2bf2f')
      rect(720, 421, 116, 87, '#17232f')
      rect(741, 438, 76, 76, '#222b35')
      rect(764, 461, 31, 31, '#c5c8c4')
      rect(775, 470, 10, 12, '#f2bf2f')

      text('CEBU', 292, 398, '#1b5cac', 8, 'center')

      const canDrawBoy =
        introBoyReady && introBoy.complete && introBoy.naturalWidth > 0 && introBoy.naturalHeight > 0
      const canDrawGirl =
        introGirlReady && introGirl.complete && introGirl.naturalWidth > 0 && introGirl.naturalHeight > 0

      if (characterRef.current === 'boy' && canDrawBoy) {
        ctx.drawImage(introBoy, 170, 108, 145, 145)
      } else if (canDrawGirl) {
        ctx.drawImage(introGirl, 170, 108, 145, 145)
      }

      const officerHop = Math.abs(Math.sin(time / 165)) * 19
      const shadowWidth = 58 - officerHop * 0.9
      rect(104 + officerHop * 0.45, 447, shadowWidth, 7, 'rgba(20, 31, 37, 0.24)')
      ctx.save()
      ctx.translate(103, 357 - officerHop)
      ctx.scale(1.45, 1.45)
      drawOfficer(0, 0, time, false)
      ctx.restore()
    }

    const drawWorld = (offset: number, currentStage: number) => {
      rect(0, 0, WIDTH, HEIGHT, '#d7d0bd')

      for (let y = -120; y < HEIGHT + 120; y += 120) {
        const sy = y + (offset * 0.45) % 120
        const leftColor = (Math.floor(y / 120) & 1) === 0 ? '#b56f55' : '#8fa28c'
        const rightColor = (Math.floor(y / 120) & 1) === 0 ? '#d0a15d' : '#8a9da1'

        rect(0, sy, 164, 104, leftColor)
        rect(8, sy + 8, 146, 17, '#e2d6bd')
        rect(15, sy + 33, 132, 50, '#6f6256')
        rect(18, sy + 37, 126, 8, '#d95445')
        for (let x = 25; x < 140; x += 38) rect(x, sy + 53, 21, 24, '#3e5152')

        rect(796, sy - 45, 164, 108, rightColor)
        rect(804, sy - 37, 146, 16, '#e7d5ad')
        rect(812, sy - 12, 132, 49, '#675e56')
        rect(812, sy - 14, 132, 8, '#3e7b74')
        for (let x = 820; x < 940; x += 38) rect(x, sy - 4, 21, 31, '#37494c')

        rect(22, sy + 13, 118, 10, '#f0dd85')
        text((Math.floor(y / 120) & 1) === 0 ? 'CARINDERIA' : 'UKAY-UKAY', 81, sy + 22, '#57493e', 6, 'center')
        rect(815, sy - 32, 126, 9, '#eee4c8')
        text((Math.floor(y / 120) & 1) === 0 ? 'CEBU TRADING' : 'SARI-SARI', 878, sy - 24, '#5b5146', 6, 'center')
      }

      rect(164, 0, 26, HEIGHT, '#aaa292')
      rect(770, 0, 26, HEIGHT, '#aaa292')
      for (let y = -35; y < HEIGHT + 50; y += 58) {
        const sy = y + (offset % 58)
        rect(169, sy, 14, 28, '#7c7569')
        rect(777, sy, 14, 28, '#7c7569')
      }

      rect(190, 0, 580, HEIGHT, '#555a5b')
      rect(190, 0, 6, HEIGHT, '#ded5bd')
      rect(764, 0, 6, HEIGHT, '#ded5bd')

      for (const laneX of [305, 420, 535, 650]) {
        for (let y = -70; y < HEIGHT + 70; y += 94) {
          rect(laneX, y + (offset % 94), 5, 43, '#ddd6bf')
        }
      }

      rect(19, 17, 130, 45, '#f3ead5')
      rect(23, 21, 122, 37, '#2e6b67')
      text('SANCIANGCO ST.', 84, 45, '#fff5dd', 7, 'center')
    }

    const drawCar = (x: number, y: number, color: string) => {
      rect(x + 3, y + 3, CAR_W, CAR_H, '#10242c')
      rect(x, y + 9, CAR_W, CAR_H - 18, color)
      rect(x + 7, y, CAR_W - 14, CAR_H, color)
      rect(x + 10, y + 13, CAR_W - 20, 19, '#9bd9e3')
      rect(x + 10, y + 53, CAR_W - 20, 16, '#153746')
      rect(x - 4, y + 16, 7, 16, '#101f27')
      rect(x + CAR_W - 3, y + 16, 7, 16, '#101f27')
      rect(x - 4, y + 56, 7, 16, '#101f27')
      rect(x + CAR_W - 3, y + 56, 7, 16, '#101f27')
      rect(x + 7, y + 5, 9, 6, '#ffefc6')
      rect(x + CAR_W - 16, y + 5, 9, 6, '#ffefc6')
    }

    const drawJeepney = (x: number, y: number) => {
      rect(x + 4, y + 4, 64, 112, '#172733')
      rect(x - 4, y + 18, 8, 24, '#1b2530')
      rect(x + 64, y + 18, 8, 24, '#1b2530')
      rect(x - 4, y + 76, 8, 24, '#1b2530')
      rect(x + 64, y + 76, 8, 24, '#1b2530')
      rect(x, y + 7, 64, 98, '#1768b7')
      rect(x + 6, y + 14, 52, 70, '#2488d0')
      rect(x + 6, y + 12, 52, 13, '#db3b3b')
      rect(x + 10, y + 27, 44, 24, '#183e63')
      rect(x + 14, y + 30, 15, 17, '#9bd9e3')
      rect(x + 35, y + 30, 15, 17, '#9bd9e3')
      rect(x + 5, y + 56, 54, 15, '#f4c83f')
      text('CEBU', x + 32, y + 67, '#15529c', 5, 'center')
      rect(x + 10, y + 77, 44, 16, '#173d5c')
      rect(x + 5, y + 99, 54, 8, '#d9ddd8')
      rect(x + 10, y + 93, 11, 7, '#ffd451')
      rect(x + 43, y + 93, 11, 7, '#ffd451')
      rect(x + 27, y + 101, 10, 8, '#767d7e')
    }

    const drawStudent = (x: number, y: number, time: number) => {
      const step = Math.floor(time / 110) % 2
      const bob = step ? 0 : 2
      const py = y + bob

      rect(x - 3, y + 59, 42, 6, 'rgba(20, 26, 25, 0.22)')

      if (characterRef.current === 'boy') {
        rect(x + 7, py + 49, 10, step ? 13 : 8, '#24272b')
        rect(x + 22, py + 49, 10, step ? 8 : 13, '#24272b')
        rect(x + 5, py + 59 + (step ? 4 : 0), 14, 6, '#141619')
        rect(x + 20, py + 59 + (step ? 0 : 4), 14, 6, '#141619')
        rect(x + 7, py + 22, 25, 29, '#202226')
        rect(x + (step ? 1 : 3), py + 25, 8, 22, '#1b1d20')
        rect(x + (step ? -1 : 2), py + 42, 8, 8, '#d39a78')
        rect(x + (step ? 29 : 27), py + 25, 8, 22, '#1b1d20')
        rect(x + (step ? 31 : 28), py + 42, 8, 8, '#d39a78')
        rect(x + 13, py + 23, 4, 8, '#277b55')
        rect(x + 24, py + 23, 4, 8, '#277b55')
        rect(x + 17, py + 29, 8, 4, '#58cbb0')
        rect(x + 9, py + 5, 22, 19, '#d39a78')
        rect(x + 7, py + 1, 28, 10, '#18191c')
        rect(x + 5, py + 8, 8, 13, '#18191c')
        rect(x + 29, py + 8, 8, 13, '#18191c')
        rect(x + 11, py - 2, 21, 6, '#18191c')
        return
      }

      rect(x + 7, py + 50, 9, step ? 12 : 7, '#d39a78')
      rect(x + 22, py + 50, 9, step ? 7 : 12, '#d39a78')
      rect(x + 5, py + 58 + (step ? 4 : 0), 13, 6, '#17191d')
      rect(x + 20, py + 58 + (step ? 0 : 4), 13, 6, '#17191d')

      rect(x + 5, py + 40, 28, 7, '#17191d')
      rect(x + 7, py + 35, 24, 18, '#232428')
      rect(x + 4, py + 47, 30, 8, '#17191d')

      rect(x + 7, py + 21, 25, 21, '#202126')
      rect(x + 11, py + 20, 17, 5, '#16171a')
      rect(x + 13, py + 23, 4, 7, '#247953')
      rect(x + 24, py + 23, 4, 7, '#247953')
      rect(x + 17, py + 28, 8, 3, '#54b788')

      rect(x + (step ? 1 : 3), py + 24, 8, 22, '#202126')
      rect(x + (step ? -1 : 2), py + 41, 8, 8, '#d39a78')
      rect(x + (step ? 29 : 27), py + 24, 8, 22, '#202126')
      rect(x + (step ? 31 : 28), py + 41, 8, 8, '#d39a78')

      rect(x + 9, py + 4, 22, 19, '#d39a78')
      rect(x + 13, py - 5, 14, 8, '#16171a')
      rect(x + 9, py - 2, 22, 7, '#16171a')
      rect(x + 6, py + 3, 28, 10, '#16171a')
      rect(x + 5, py + 10, 31, 12, '#16171a')
      rect(x + 8, py + 18, 8, 8, '#16171a')
      rect(x + 25, py + 18, 8, 8, '#16171a')
      rect(x + 12, py + 18, 17, 8, '#1f2024')
    }

    const drawOfficer = (x: number, y: number, time: number, close: boolean) => {
      const step = Math.floor(time / 105) % 2
      const uniform = '#3f8b5d'
      rect(x + 5, y + 51, 9, step ? 10 : 5, '#172c3b')
      rect(x + 22, y + 51, 9, step ? 5 : 10, '#172c3b')
      rect(x + 4, y + 27, 28, 28, uniform)
      rect(x - 2, y + 30 + (step ? 5 : 0), 8, 22, '#d18e68')
      rect(x + 30, y + 35 - (step ? 5 : 0), 8, 22, '#d18e68')
      rect(x + 9, y + 8, 19, 20, '#c9825f')
      rect(x + 6, y + 3, 25, 9, '#194b38')
      rect(x + 3, y + 10, 31, 5, '#2e7650')
      rect(x + 15, y + 31, 6, 7, '#f7d653')
      if (close) {
        rect(x - 5, y - 7, 44, 4, '#ef5d4b')
      }
    }

    const drawCrossingVehicle = (car: CrossingCar) => {
      const h = car.jeepney ? 42 : 34
      rect(car.x + 4, car.y + 4, car.width, h, '#20272a')
      rect(car.x, car.y, car.width, h, car.color)
      rect(car.x + 10, car.y - 5, car.width * 0.46, 9, '#dce7df')
      rect(car.x + 14, car.y - 3, car.width * 0.18, 6, '#8ecbd5')
      rect(car.x + car.width - 21, car.y + h - 4, 14, 8, '#1a2024')
      rect(car.x + 8, car.y + h - 4, 14, 8, '#1a2024')
      if (car.jeepney) {
        rect(car.x + 5, car.y + 5, car.width - 10, 8, '#d83c3b')
        rect(car.x + 12, car.y + 20, car.width - 24, 11, '#f1c53f')
        text('CEBU', car.x + car.width / 2, car.y + 29, '#1a5aa4', 5, 'center')
        rect(car.x - 6, car.y + 26, 10, 10, '#d9ddd8')
        rect(car.x + car.width - 4, car.y + 25, 12, 11, '#d9ddd8')
      }
    }

    const updateCrossing = () => {
      if (gameRef.current.state !== 'crossing') return
      const crossing = crossingRef.current
      const difficultyMultiplier =
        difficultyRef.current === 'relaxed' ? 0.78 : difficultyRef.current === 'extreme' ? 1.38 : 1
      crossing.hitFlash = Math.max(0, crossing.hitFlash - 1)

      for (const car of crossing.cars) {
        car.x += car.speed * difficultyMultiplier
        if (car.speed > 0 && car.x > WIDTH + 150) car.x = -car.width - 120 - Math.random() * 160
        if (car.speed < 0 && car.x < -car.width - 150) car.x = WIDTH + 120 + Math.random() * 160

        const carHeight = car.jeepney ? 42 : 34
        const hit =
          crossing.playerX + 5 < car.x + car.width &&
          crossing.playerX + RUNNER_W - 5 > car.x &&
          crossing.playerY + 8 < car.y + carHeight &&
          crossing.playerY + RUNNER_H - 5 > car.y

        if (hit) {
          crossing.playerX = 716
          crossing.playerY = 484
          crossing.hitFlash = 90
          break
        }
      }
    }

    const drawCrossing = (time: number) => {
      const crossing = crossingRef.current
      rect(0, 0, WIDTH, HEIGHT, '#d4cdbd')
      rect(0, 74, WIDTH, 384, '#3f4446')
      rect(0, 74, WIDTH, 10, '#c4bba9')
      rect(0, 448, WIDTH, 10, '#c4bba9')
      rect(0, 274, WIDTH, 34, '#8b814d')
      rect(0, 287, WIDTH, 4, '#6d663f')

      for (const y of [145, 211, 363, 429]) {
        for (let x = 0; x < WIDTH; x += 78) rect(x, y, 42, 3, 'rgba(243,240,232,0.28)')
      }

      for (let y = 88; y < 448; y += 39) {
        const wear = (y / 39) % 3
        rect(150 + wear * 8, y, 68 - wear * 6, 18, 'rgba(243,240,232,0.22)')
      }
      rect(134, 79, 4, 369, 'rgba(243,240,232,0.14)')
      rect(230, 79, 4, 369, 'rgba(243,240,232,0.14)')

      rect(18, 16, 254, 42, '#f1ead9')
      rect(24, 22, 242, 30, '#2d6a57')
      text('CROSS SANCIANGCO STREET', 145, 42, '#fff8e5', 8, 'center')
      text('FADED CROSSWALK', 182, 475, '#746e63', 7, 'center')

      crossing.cars.forEach(drawCrossingVehicle)
      drawStudent(crossing.playerX, crossing.playerY, time)

      if (gameRef.current.state === 'caught') {
        drawOfficer(Math.min(WIDTH - 50, crossing.playerX + 55), 48, time, true)
      }

      if (crossing.hitFlash > 0) {
        rect(333, 16, 294, 42, '#ef5d4b')
        text('HIT! TRY AGAIN', WIDTH / 2, 43, '#fff4de', 9, 'center')
      }
    }

    const drawHazard = (hazard: Hazard) => {
      if (hazard.kind === 'jeepney') {
        drawJeepney(hazard.x, hazard.y)
      } else {
        drawCar(hazard.x, hazard.y, hazard.color)
      }
    }

    const drawCoin = (coin: Coin, time: number) => {
      if (coin.collected) return
      const squeeze = Math.abs(Math.sin(time / 130)) * 4
      rect(coin.x + squeeze, coin.y, 22 - squeeze * 2, 26, '#c88722')
      rect(coin.x + 4 + squeeze, coin.y + 4, 14 - squeeze * 2, 18, '#f6cc45')
      rect(coin.x + 9, coin.y + 7, 4, 12, '#fff0a6')
    }

    const spawnMazeRow = (game: typeof gameRef.current) => {
      const gapLane = Math.floor(Math.random() * lanes.length)
      const rowY = -80
      const occupied = new Set<number>()
      const carCount = Math.min(4, 2 + Math.floor(game.stage / 2))

      while (occupied.size < carCount) {
        const lane = Math.floor(Math.random() * lanes.length)
        if (lane !== gapLane) occupied.add(lane)
      }

      occupied.forEach((lane) => {
        const isJeepney = Math.random() < 0.28
        const vehicleWidth = isJeepney ? 64 : CAR_W
        game.hazards.push({
          x: lanes[lane] - vehicleWidth / 2,
          y: rowY - Math.random() * 90,
          width: vehicleWidth,
          height: isJeepney ? 112 : CAR_H,
          kind: isJeepney ? 'jeepney' : 'car',
          color: isJeepney ? '#1768b7' : carColors[Math.floor(Math.random() * carColors.length)],
          speedBoost: isJeepney ? Math.random() * 0.8 : Math.random() * 2.2,
        })
      })

      for (let i = 0; i < 4; i++) {
        game.coins.push({
          x: lanes[gapLane] - 11,
          y: rowY - 35 - i * 48,
          collected: false,
        })
      }
    }

    const collides = (playerX: number, hazard: Hazard) => {
      const pad = 3
      return (
        playerX + pad < hazard.x + hazard.width - pad &&
        playerX + RUNNER_W - pad > hazard.x + pad &&
        PLAYER_Y + 6 < hazard.y + hazard.height - pad &&
        PLAYER_Y + RUNNER_H - 6 > hazard.y + pad
      )
    }

    const update = () => {
      const game = gameRef.current
      if (game.state !== 'playing') return

      const steerSpeed = 7.2
      if (keysRef.current.left) game.playerX -= steerSpeed
      if (keysRef.current.right) game.playerX += steerSpeed
      game.playerX = Math.max(ROAD_LEFT + 13, Math.min(ROAD_RIGHT - RUNNER_W - 13, game.playerX))
      game.officerX += (game.playerX - game.officerX) * 0.065

      game.distance += game.speed / 10
      const baseSpeed = difficultyRef.current === 'relaxed' ? 3.7 : difficultyRef.current === 'extreme' ? 5.4 : 4.4
      const maxSpeed = difficultyRef.current === 'relaxed' ? 7.2 : difficultyRef.current === 'extreme' ? 10.8 : 8.6
      game.speed = Math.min(maxSpeed, baseSpeed + game.distance / 800)
      game.roadOffset += game.speed
      game.spawnTimer -= 1
      game.timeLeft = Math.max(0, game.timeLeft - 1 / 60)
      game.invulnerable = Math.max(0, game.invulnerable - 1)
      game.penaltyFlash = Math.max(0, game.penaltyFlash - 1)

      if (Math.ceil(game.timeLeft) !== Math.ceil(game.timeLeft + 1 / 60)) {
        setTimeLeft(Math.ceil(game.timeLeft))
      }

      if (game.timeLeft <= 0) {
        game.state = 'won'
        localStorage.setItem('road-rush-survived', 'true')
        const activeProfile = loadProfiles().find((profile) => profile.id === activeProfileRef.current)
        const completedRun: RunRecord = {
          id: Date.now(),
          timeMs: runStartRef.current ? Date.now() - runStartRef.current : 120000,
          money: game.wallet,
          playerId: activeProfile?.id,
          playerName: activeProfile?.username,
        }
        const nextRunHistory = [...loadRunHistory(), completedRun].slice(-30)
        localStorage.setItem('road-rush-runs', JSON.stringify(nextRunHistory))
        setRunHistory(nextRunHistory)
        const finalScore = Math.floor(game.distance) + game.wallet * 10
        const nextBest = Math.max(finalScore, best)
        localStorage.setItem('gridlock-best', String(nextBest))
        setBest(nextBest)
        setScore(finalScore)
        setGameState('won')
        return
      }

      const nextStage = Math.min(9, Math.floor(game.distance / 450) + 1)
      if (nextStage !== game.stage) {
        game.stage = nextStage
        setStage(nextStage)
      }

      if (game.spawnTimer <= 0) {
        spawnMazeRow(game)
        game.spawnTimer = Math.max(72, 126 - game.stage * 4)
      }

      for (const hazard of game.hazards) {
        hazard.y += game.speed + hazard.speedBoost
        if (game.invulnerable === 0 && collides(game.playerX, hazard)) {
          game.wallet -= 50
          game.penaltyFlash = 100
          game.invulnerable = 120
          setWallet(game.wallet)
          game.hazards = game.hazards.filter((item) => item.y < PLAYER_Y - 130 || item.y > PLAYER_Y + 130)

          if (game.wallet <= 0) {
            game.state = 'gameover'
            const finalScore = Math.floor(game.distance)
            const nextBest = Math.max(finalScore, best)
            localStorage.setItem('gridlock-best', String(nextBest))
            setBest(nextBest)
            setScore(finalScore)
            setGameState('gameover')
            keysRef.current.left = false
            keysRef.current.right = false
          }
          break
        }
      }

      game.hazards = game.hazards.filter((hazard) => hazard.y < HEIGHT + 120)
      for (const coin of game.coins) {
        coin.y += game.speed
        if (
          !coin.collected &&
          game.playerX < coin.x + 22 &&
          game.playerX + RUNNER_W > coin.x &&
          PLAYER_Y < coin.y + 26 &&
          PLAYER_Y + RUNNER_H > coin.y
        ) {
          coin.collected = true
          game.wallet += 1
          setWallet(game.wallet)
        }
      }
      game.coins = game.coins.filter((coin) => coin.y < HEIGHT + 50)
      setScore(Math.floor(game.distance))
    }

    const render = (time: number) => {
      const game = gameRef.current
      update()
      if (game.state === 'idle') {
        drawIntro(time)
      } else if (game.state === 'crossing' || game.state === 'caught') {
        updateCrossing()
        drawCrossing(time)
      } else {
        drawWorld(game.roadOffset, game.stage)
        game.coins.forEach((coin) => drawCoin(coin, time))
        game.hazards.forEach(drawHazard)
        drawOfficer(game.officerX, game.state === 'gameover' ? 454 : 486, time, game.state === 'gameover')
        if (game.invulnerable === 0 || Math.floor(game.invulnerable / 7) % 2 === 0) {
          drawStudent(game.playerX, PLAYER_Y, time)
        }

        if (game.state === 'playing' && game.distance < 90) {
          text('FIND THE GAP', WIDTH / 2, 65, '#f7d653', 11, 'center')
        }
        if (game.penaltyFlash > 0) {
          rect(294, 84, 372, 54, '#071b29')
          rect(300, 90, 360, 42, '#ef5d4b')
          text('JAYWALKING FEE  -P50', WIDTH / 2, 117, '#fff1ce', 10, 'center')
        }
      }

      frameRef.current = requestAnimationFrame(render)
    }

    frameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameRef.current)
  }, [best])

  const hasSurvived = localStorage.getItem('road-rush-survived') === 'true'
  const playerStandings = profiles.map((profile) => {
    const runs = runHistory.filter((run) => run.playerId === profile.id)
    return {
      profile,
      fastest: runs.length ? Math.min(...runs.map((run) => run.timeMs)) : null,
      richest: runs.length ? Math.max(...runs.map((run) => run.money)) : null,
    }
  })
  const fastestPlayers = [...playerStandings].sort(
    (a, b) => (a.fastest ?? Number.POSITIVE_INFINITY) - (b.fastest ?? Number.POSITIVE_INFINITY),
  )
  const richestPlayers = [...playerStandings].sort(
    (a, b) => (b.richest ?? Number.NEGATIVE_INFINITY) - (a.richest ?? Number.NEGATIVE_INFINITY),
  )

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#242725]">
      <section className="app-shell relative mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-3 py-4 sm:px-8 sm:py-8">
        <div className="game-stage relative flex flex-1 items-center justify-center">
          <div className="game-shell road-shell">
            {(gameState === 'crossing' || gameState === 'caught') ? (
              <div className="crossing-bar">
                <span><b>GET ACROSS THE ROAD</b><small>Use arrows or WASD</small></span>
                <button className="home-button" onClick={goHome}>EXIT</button>
              </div>
            ) : gameState !== 'idle' && (
              <div className="game-topbar">
                <span><b>₱{wallet}</b><small>wallet</small></span>
                <span><b>{String(score).padStart(4, '0')} m</b><small>distance</small></span>
                <span><b>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</b><small>time left</small></span>
                <button className="home-button" onClick={goHome}>EXIT</button>
              </div>
            )}

            <div className="canvas-wrap">
              <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Road Rush: Late for Class road chase game" />
              {gameState === 'idle' ? (
                <div className="intro-overlay">
                  <div className="intro-title" aria-label="Road Rush">
                    <span>ROAD RUSH</span>
                  </div>
                  <button className="home-start" onClick={beginFromHome}>START GAME</button>
                  <div className="home-signpost">
                    <i aria-hidden="true" />
                    <button
                      onClick={() => {
                        setProfileStep(profiles.length === 0 ? 'username' : 'list')
                        setMenuPanel('profile')
                      }}
                    >
                      {profiles.find((profile) => profile.id === activeProfileId)?.username || 'PLAYER PROFILE'}
                    </button>
                    <button onClick={() => setMenuPanel('character')}>SELECT CHARACTER</button>
                    <button onClick={() => setMenuPanel('options')}>OPTIONS</button>
                    <button onClick={() => setMenuPanel('achievements')}>ACHIEVEMENTS</button>
                    <button onClick={() => setMenuPanel('showcase')}>HELP</button>
                  </div>

                  {menuPanel && (
                    <div className={`menu-dialog ${menuPanel === 'showcase' ? 'popup-gallery-backdrop' : ''}`}>
                      <div
                        className={
                          menuPanel === 'showcase'
                            ? 'popup-showcase'
                            : `menu-card ${
                                menuPanel === 'profile' && profileStep !== 'list' ? 'profile-wizard-card' : ''
                              }`
                        }
                      >
                        {menuPanel === 'profile' && profileStep !== 'list' && profiles.length > 0 ? (
                          <button className="menu-close" onClick={() => setProfileStep('list')} aria-label="Back">
                            BACK
                          </button>
                        ) : (menuPanel !== 'profile' || profiles.length > 0) && (
                          <button className="menu-close" onClick={() => setMenuPanel(null)} aria-label="Close menu">
                            CLOSE
                          </button>
                        )}

                        {menuPanel === 'profile' && (
                          profileStep === 'list' ? (
                            <>
                              <span className="menu-eyebrow">PLAYER PROFILE</span>
                              <h2>Who is playing?</h2>
                              <p>Create up to three offline player profiles. Select one before starting a run.</p>
                              <div className="profile-list">
                                {profiles.map((profile, index) => (
                                  <div className={profile.id === activeProfileId ? 'active' : ''} key={profile.id}>
                                    <span>PLAYER {index + 1}</span>
                                    <b>{profile.username}</b>
                                    <small>{profile.age} years · {profile.sex}</small>
                                    <div>
                                      <button onClick={() => selectProfile(profile.id)}>
                                        {profile.id === activeProfileId ? 'SELECTED' : 'SELECT'}
                                      </button>
                                      <button onClick={() => deleteProfile(profile.id)}>DELETE</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {profiles.length < 3 && (
                                <button
                                  className="profile-add"
                                  onClick={() => {
                                    setProfileDraft({ username: '', age: '', sex: 'female' })
                                    setProfileStep('username')
                                  }}
                                >
                                  ADD PLAYER {profiles.length + 1}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="profile-wizard">
                              <div className="profile-wizard-title">
                                {profileStep === 'username' ? '1  USERNAME' : profileStep === 'age' ? '2  AGE' : '3  SEX'}
                              </div>
                              <div className="profile-wizard-question">
                                {profileStep === 'username' && (
                                  <>
                                    <label htmlFor="profile-username">What is your username?</label>
                                    <input
                                      id="profile-username"
                                      autoFocus
                                      maxLength={14}
                                      value={profileDraft.username}
                                      onChange={(event) =>
                                        setProfileDraft((draft) => ({ ...draft, username: event.target.value }))
                                      }
                                      placeholder="PLAYER NAME"
                                    />
                                  </>
                                )}
                                {profileStep === 'age' && (
                                  <>
                                    <label htmlFor="profile-age">How old are you?</label>
                                    <input
                                      id="profile-age"
                                      autoFocus
                                      type="number"
                                      min="5"
                                      max="99"
                                      value={profileDraft.age}
                                      onChange={(event) =>
                                        setProfileDraft((draft) => ({ ...draft, age: event.target.value }))
                                      }
                                      placeholder="AGE 5–99"
                                    />
                                  </>
                                )}
                                {profileStep === 'sex' && (
                                  <>
                                    <label>Select your sex</label>
                                    <div className="sex-picker">
                                      <button
                                        className={profileDraft.sex === 'female' ? 'active' : ''}
                                        onClick={() =>
                                          setProfileDraft((draft) => ({ ...draft, sex: 'female' }))
                                        }
                                      >
                                        FEMALE
                                      </button>
                                      <button
                                        className={profileDraft.sex === 'male' ? 'active' : ''}
                                        onClick={() => setProfileDraft((draft) => ({ ...draft, sex: 'male' }))}
                                      >
                                        MALE
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                              <button
                                className="profile-wizard-ok"
                                disabled={
                                  (profileStep === 'username' && !profileDraft.username.trim()) ||
                                  (profileStep === 'age' &&
                                    (!Number.isInteger(Number(profileDraft.age)) ||
                                      Number(profileDraft.age) < 5 ||
                                      Number(profileDraft.age) > 99))
                                }
                                onClick={() => {
                                  if (profileStep === 'username') setProfileStep('age')
                                  else if (profileStep === 'age') setProfileStep('sex')
                                  else createProfile()
                                }}
                              >
                                {profileStep === 'sex' ? 'CREATE' : 'OK'}
                              </button>
                            </div>
                          )
                        )}

                        {menuPanel === 'showcase' && (
                          <div className="popup-grid">
                            <section className="pixel-popup popup-blue">
                              <h2>PAUSED</h2>
                              <div className="popup-body">
                                <button className="pixel-action primary" onClick={() => setMenuPanel(null)}>
                                  RESUME
                                </button>
                                <button className="pixel-action" onClick={() => setMenuPanel('options')}>
                                  SETTINGS
                                </button>
                                <button className="pixel-action" onClick={goHome}>MAIN MENU</button>
                                <button className="pixel-action" onClick={goHome}>QUIT</button>
                              </div>
                            </section>

                            <section className="pixel-popup popup-blue settings-popup">
                              <h2>SETTINGS</h2>
                              <div className="popup-body">
                                <div className="setting-row"><b>MUSIC</b><i><span style={{ width: '72%' }} /></i></div>
                                <div className="setting-row"><b>SFX</b><i><span style={{ width: '64%' }} /></i></div>
                                <div className="setting-row"><b>QUALITY</b><strong>HIGH</strong></div>
                                <div className="setting-row"><b>LANGUAGE</b><strong>ENGLISH</strong></div>
                                <button className="pixel-action primary" onClick={() => setMenuPanel(null)}>BACK</button>
                              </div>
                            </section>

                            <section className="pixel-popup popup-red gameover-popup">
                              <h2>GAME OVER</h2>
                              <div className="popup-body">
                                <p>You didn't make it<br />in time...</p>
                                <div className="school-bag" aria-hidden="true"><i /><i /></div>
                                <button className="pixel-action primary" onClick={startCrossing}>RETRY</button>
                                <button className="pixel-action" onClick={goHome}>MAIN MENU</button>
                              </div>
                            </section>

                            <section className="pixel-popup popup-green">
                              <h2>LEVEL COMPLETE!</h2>
                              <div className="popup-body">
                                <p>You made it to class!</p>
                                <div className="reward-chip"><span>₱</span><b>+ ₱50</b></div>
                                <button className="pixel-action primary" onClick={() => setMenuPanel(null)}>
                                  CONTINUE
                                </button>
                              </div>
                            </section>

                            <section className="pixel-popup popup-blue tutorial-popup">
                              <h2>TUTORIAL</h2>
                              <div className="popup-body">
                                <div className="tutorial-visual">
                                  <img
                                    src={
                                      selectedCharacter === 'girl'
                                        ? '/sanciangko-mascot-front.png'
                                        : '/sanciangko-mascot-boy-front.png'
                                    }
                                    alt=""
                                  />
                                  <div className="pixel-arrow">↑</div>
                                </div>
                                <p>Use arrows or WASD<br />to dodge traffic!</p>
                                <button className="pixel-action primary" onClick={() => setMenuPanel(null)}>
                                  GOT IT!
                                </button>
                              </div>
                            </section>

                            <section className="pixel-popup popup-gold">
                              <h2>ITEM OBTAINED!</h2>
                              <div className="popup-body">
                                <div className="peso-coin">₱</div>
                                <p><b>ALLOWANCE</b><br />+ ₱25</p>
                                <button className="pixel-action primary" onClick={() => setMenuPanel(null)}>OK</button>
                              </div>
                            </section>
                          </div>
                        )}

                        {menuPanel === 'character' && (
                          <>
                            <span className="menu-eyebrow">CHARACTER SELECT</span>
                            <h2>Choose your runner</h2>
                            <div className="character-grid">
                              <button
                                className={selectedCharacter === 'girl' ? 'active' : ''}
                                onClick={() => chooseCharacter('girl')}
                              >
                                <img src="/sanciangko-mascot-front.png" alt="Girl student character" />
                                <b>GIRL</b>
                                <small>UV skirt uniform</small>
                              </button>
                              <button
                                className={selectedCharacter === 'boy' ? 'active' : ''}
                                onClick={() => chooseCharacter('boy')}
                              >
                                <img src="/sanciangko-mascot-boy-front.png" alt="Boy student character" />
                                <b>BOY</b>
                                <small>UV trouser uniform</small>
                              </button>
                            </div>
                            <button className="character-confirm" onClick={() => setMenuPanel(null)}>
                              CONFIRM {selectedCharacter.toUpperCase()}
                            </button>
                          </>
                        )}

                        {menuPanel === 'options' && (
                          <>
                            <span className="menu-eyebrow">OPTIONS</span>
                            <h2>Traffic difficulty</h2>
                            <p>Choose how quickly vehicles move during both parts of the game.</p>
                            <div className="difficulty-picker">
                              <button
                                className={difficulty === 'relaxed' ? 'active' : ''}
                                onClick={() => changeDifficulty('relaxed')}
                              >
                                <b>RELAXED</b>
                                <small>Slower traffic</small>
                              </button>
                              <button
                                className={difficulty === 'normal' ? 'active' : ''}
                                onClick={() => changeDifficulty('normal')}
                              >
                                <b>NORMAL</b>
                                <small>Full road rush</small>
                              </button>
                              <button
                                className={difficulty === 'extreme' ? 'active extreme' : 'extreme'}
                                onClick={() => changeDifficulty('extreme')}
                              >
                                <b>MONDAY RUSH</b>
                                <small>Extreme traffic</small>
                              </button>
                            </div>
                          </>
                        )}

                        {menuPanel === 'achievements' && (
                          <>
                            <span className="menu-eyebrow">ACHIEVEMENTS</span>
                            <h2>Your progress</h2>
                            <div className="achievement-list">
                              <div className={best > 0 ? 'unlocked' : ''}>
                                <b>THE CHASE BEGINS</b>
                                <small>Reach the far sidewalk</small>
                              </div>
                              <div className={best >= 500 ? 'unlocked' : ''}>
                                <b>ROAD RUNNER</b>
                                <small>Score at least 500 points</small>
                              </div>
                              <div className={hasSurvived ? 'unlocked' : ''}>
                                <b>SURVIVE SANCIANGKO</b>
                                <small>Finish the two-minute chase</small>
                              </div>
                            </div>
                            <div className="leaderboards">
                              <div className="leaderboard">
                                <h3>FASTEST FINISH</h3>
                                {fastestPlayers.length > 0 ? (
                                  <ol>
                                    {fastestPlayers.map((standing, index) => (
                                      <li key={standing.profile.id}>
                                        <span>#{index + 1}</span>
                                        <b>{standing.profile.username}</b>
                                        <small>{standing.fastest === null ? '--:--' : formatFinishTime(standing.fastest)}</small>
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <p>Finish a run to set the first time.</p>
                                )}
                              </div>
                              <div className="leaderboard">
                                <h3>MOST MONEY</h3>
                                {richestPlayers.length > 0 ? (
                                  <ol>
                                    {richestPlayers.map((standing, index) => (
                                      <li key={standing.profile.id}>
                                        <span>#{index + 1}</span>
                                        <b>{standing.profile.username}</b>
                                        <small>{standing.richest === null ? '₱--' : `₱${standing.richest}`}</small>
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <p>Finish a run to set the first balance.</p>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {menuPanel === 'help' && (
                          <>
                            <span className="menu-eyebrow">HELP</span>
                            <h2>How to play</h2>
                            <div className="help-list">
                              <div><b>1</b><span>Use arrows or WASD to cross the first road.</span></div>
                              <div><b>2</b><span>Avoid every moving car and Cebu jeepney.</span></div>
                              <div><b>3</b><span>During the chase, steer left and right through open lanes.</span></div>
                              <div><b>4</b><span>Collect ₱1 coins and survive until the timer reaches zero.</span></div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : gameState === 'caught' ? (
                <div className="game-overlay caught-overlay">
                  <div className="overlay-card">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ad5d49]">OFFICER SPOTTED YOU</p>
                    <h2 className="text-3xl font-bold leading-tight sm:text-5xl">CAUGHT JAYWALKING!</h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#626862] sm:text-base">
                      You crossed outside the faded markings. The green officer is coming—run through Sanciangko Street and lose him.
                    </p>
                    <div className="result-actions">
                      <button className="start-button" onClick={startGame}>RUN!</button>
                      <button className="back-button" onClick={goHome}>BACK HOME</button>
                    </div>
                  </div>
                </div>
              ) : (gameState === 'gameover' || gameState === 'won') && (
                <div className="game-overlay">
                  <div className="overlay-card">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ad5d49]">
                      {gameState === 'won' ? 'LEVEL FINISHED' : gameState === 'gameover' ? 'OUT OF CASH' : 'BELL JUST RANG'}
                    </p>
                    <h2 className="text-3xl font-bold leading-tight sm:text-5xl">
                      {gameState === 'won' ? 'YOU SURVIVED SANCIANGKO!' : gameState === 'gameover' ? 'THREE STRIKES' : 'RUN FOR IT'}
                    </h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#626862] sm:text-base">
                      {gameState === 'won'
                        ? `The two minutes are over. She finished Sanciangko Street with ₱${wallet} left.`
                        : gameState === 'gameover'
                          ? 'Three jaywalking fees used all ₱150. The officer has caught up—next time, watch for the open lane.'
                          : 'Survive for two minutes. Each crash costs a ₱50 jaywalking fee from her ₱150 wallet.'}
                    </p>
                    <div className="result-actions">
                      <button className="start-button" onClick={startCrossing}>RUN AGAIN</button>
                      <button className="back-button" onClick={goHome}>BACK TO HOME</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="hidden items-center gap-5 text-xs text-[#737973] sm:flex">
            {gameState === 'crossing' ? (
              <>
                <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> CROSS</span>
                <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ALTERNATE</span>
              </>
            ) : gameState === 'playing' ? (
              <>
                <span><kbd>←</kbd><kbd>→</kbd> STEER</span>
                <span><kbd>A</kbd><kbd>D</kbd> ALTERNATE</span>
              </>
            ) : null}
          </div>
          <p className="order-last text-xs text-[#8a8e88] sm:order-none">Sanciangco Street, Cebu City</p>
          {gameState === 'crossing' ? (
            <div className="mobile-controls crossing-controls">
              <button aria-label="Move up" onClick={() => moveCrossingPlayer(0, -42)}>UP</button>
              <button aria-label="Move left" onClick={() => moveCrossingPlayer(-42, 0)}>LEFT</button>
              <button aria-label="Move down" onClick={() => moveCrossingPlayer(0, 42)}>DOWN</button>
              <button aria-label="Move right" onClick={() => moveCrossingPlayer(42, 0)}>RIGHT</button>
            </div>
          ) : gameState === 'playing' ? (
            <div className="mobile-controls drive-controls">
              <button
                aria-label="Steer left"
                onPointerDown={() => setSteering('left', true)}
                onPointerUp={() => setSteering('left', false)}
                onPointerLeave={() => setSteering('left', false)}
              >
                LEFT
              </button>
              <button
                aria-label="Steer right"
                onPointerDown={() => setSteering('right', true)}
                onPointerUp={() => setSteering('right', false)}
                onPointerLeave={() => setSteering('right', false)}
              >
                RIGHT
              </button>
            </div>
          ) : null}
        </footer>
      </section>
    </main>
  )
}
