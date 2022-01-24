import { derived, writable, get } from "svelte/store"
import { API } from "api"
import { admin } from "stores/portal"
import analytics from "analytics"

export function createAuthStore() {
  const auth = writable({
    user: null,
    tenantId: "default",
    tenantSet: false,
    loaded: false,
    postLogout: false,
  })
  const store = derived(auth, $store => {
    let initials = null
    let isAdmin = false
    let isBuilder = false
    if ($store.user) {
      const user = $store.user
      if (user.firstName) {
        initials = user.firstName[0]
        if (user.lastName) {
          initials += user.lastName[0]
        }
      } else if (user.email) {
        initials = user.email[0]
      } else {
        initials = "Unknown"
      }
      isAdmin = !!user.admin?.global
      isBuilder = !!user.builder?.global
    }
    return {
      user: $store.user,
      tenantId: $store.tenantId,
      tenantSet: $store.tenantSet,
      loaded: $store.loaded,
      postLogout: $store.postLogout,
      initials,
      isAdmin,
      isBuilder,
    }
  })

  function setUser(user) {
    auth.update(store => {
      store.loaded = true
      store.user = user
      if (user) {
        store.tenantId = user.tenantId || "default"
        store.tenantSet = true
      }
      return store
    })

    if (user) {
      analytics.activate().then(() => {
        analytics.identify(user._id, user)
        analytics.showChat({
          email: user.email,
          created_at: (user.createdAt || Date.now()) / 1000,
          name: user.account?.name,
          user_id: user._id,
          tenant: user.tenantId,
          "Company size": user.account?.size,
          "Job role": user.account?.profession,
        })
      })
    }
  }

  async function setOrganisation(tenantId) {
    const prevId = get(store).tenantId
    auth.update(store => {
      store.tenantId = tenantId
      store.tenantSet = !!tenantId
      return store
    })
    if (prevId !== tenantId) {
      // re-init admin after setting org
      await admin.init()
    }
  }

  async function setInitInfo(info) {
    await API.setInitInfo(info)
    auth.update(store => {
      store.initInfo = info
      return store
    })
    return info
  }

  async function setPostLogout() {
    auth.update(store => {
      store.postLogout = true
      return store
    })
  }

  async function getInitInfo() {
    const info = await API.getInitInfo()
    auth.update(store => {
      store.initInfo = info
      return store
    })
    return info
  }

  return {
    subscribe: store.subscribe,
    setOrganisation,
    getInitInfo,
    setInitInfo,
    checkQueryString: async () => {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has("tenantId")) {
        const tenantId = urlParams.get("tenantId")
        await setOrganisation(tenantId)
      }
    },
    setOrg: async tenantId => {
      await setOrganisation(tenantId)
    },
    checkAuth: async () => {
      const user = await API.fetchBuilderSelf()
      setUser(user)
    },
    login: async creds => {
      const tenantId = get(store).tenantId
      const response = await API.logIn({
        username: creds.username,
        password: creds.password,
        tenantId,
      })
      setUser(response.user)
    },
    logout: async () => {
      await API.logOut()
      await setInitInfo({})
      setUser(null)
      setPostLogout()
    },
    updateSelf: async fields => {
      const newUser = { ...get(auth).user, ...fields }
      await API.updateSelf(newUser)
      setUser(newUser)
    },
    forgotPassword: async email => {
      const tenantId = get(store).tenantId
      await API.requestForgotPassword({
        tenantId,
        email,
      })
    },
    resetPassword: async (password, resetCode) => {
      const tenantId = get(store).tenantId
      await API.resetPassword({
        tenantId,
        password,
        resetCode,
      })
    },
  }
}

export const auth = createAuthStore()
