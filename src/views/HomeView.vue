<template>
  <div class="home">
    <section class="top container">
      <div class="top-info">
        <div class="top-info__left">
          <div class="top-info__text">
            <span>Hi I'm</span> <br />
            <span class="top-info__main-text">Warren Scantlebury</span> <br />
            <span>welcome to my hub</span>
          </div>
          <a
            href="/Warren-Scantlebury-CV.pdf"
            class="btn btn-lg"
            download=""
            target="_blank"
            >Download CV</a
          >
        </div>
        <img
          class="top-info__right portrait"
          src="/images/my photo.jpeg"
          alt=""
        />
      </div>
    </section>
    <section class="my-work">
      <div class="container">
        <header>
          <h1 class="text-center text-capitalize display-5">My work</h1>
        </header>
        <div class="my-work__projects">
          <div class="card" style="width: 18rem">
            <img
              src="/illustrations/chatting.svg"
              style="background: white; padding: 0.5rem"
              class="card-img-top"
              alt=""
            />
            <div class="card-body">
              <h5 class="card-title">Web Chat</h5>
              <p class="card-text">
                Web chat is a fully featured chat PWA that allows users to chat
                with friends online, watch YouTube videos together and so much
                more!
              </p>
              <div class="d-flex justify-content-between">
                <button class="btn">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="currentColor"
                    class="bi bi-github"
                    viewBox="0 0 16 16"
                  >
                    <path
                      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                    />
                  </svg>
                  Source
                </button>
                <a
                  class="btn"
                  href="https://webchat.scantlebury.io"
                  target="_blank"
                >
                  Visit site
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { Options, Vue } from "vue-class-component";
import Header from "@/components/Header.vue"; // @ is an alias to /src

@Options({
  components: {
    Header,
  },
})
export default class HomeView extends Vue {}
</script>

<style lang="scss" scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0px);
  }
}

.home {
  flex-basis: 100%;
}

.top {
  margin-bottom: 3rem;
  padding-bottom: 3rem;
  border-bottom: solid thin var(--secondary);
}

.portrait {
  width: 250px;
  height: 250px;
  aspect-ratio: 1;
  border-radius: 50%;
  outline: solid 2px;
  outline-offset: 4px;
  object-fit: cover;
  object-position: top;
  @media (max-width: 768px) {
    width: 175px;
    height: 175px;
  }
}

.top-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  &__left {
    display: flex;
    flex-wrap: wrap;
  }

  &__text {
    flex-basis: 100%;
    // font-weight: 900;
    margin: 1rem 0rem;
    animation: fadeIn 0.5s ease-in 0s;
    animation-direction: normal;
    animation-fill-mode: forwards;
    text-transform: capitalize;
    font-size: calc(1.375rem + 1.5vw);
    line-height: 1.2;
  }
  &__main-text {
    font-family: "Raleway", sans-serif;
    font-size: calc(1.525rem + 3.3vw);
    // font-weight: 300;
    line-height: 1.2;
  }
  @media (max-width: 768px) {
    flex-direction: column-reverse;
    &__text {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
    }
    &__main-text {
      flex-basis: 100%;
      text-align: center;
    }
    &__left {
      justify-content: center;
    }
  }
}

.title {
  font-family: "Raleway", sans-serif;
  font-weight: 900;
  margin-bottom: 1rem;
  animation: fadeIn 0.5s ease-in 0s;
  animation-direction: normal;
  animation-fill-mode: forwards;
}

.my-work__projects {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  @media (max-width: 768px) {
    justify-content: center;
  }
}

.card {
  transition: all 0.3s;
  box-shadow: 7px 7px 12px 0px rgba(0, 0, 0, 0.4); //, -5px -5px 20px 0px rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.075);
  color: var(--secondary);
  border: none;
  &:hover {
    transition: all 0.3s;
    box-shadow: 7px 7px 15px 0px rgba(0, 0, 0, 0.2); //, -5px -5px 20px 0px rgba(255, 255, 255, 0.2);
    transform: scale(1.025);
    cursor: pointer;
  }
  border-radius: 0.5rem;
  overflow: hidden;
}
.card-title {
  font-weight: bold;
  text-align: center;
  margin: 0.5rem 0rem;
}

.card-body {
  padding: 0.5rem 1rem;
  // border: solid thin var(--secondary);
  border-top: none;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}
.btn {
  color: var(--tertiary);
  border: solid 2px var(--tertiary);
  border-radius: 0.5rem;
  // text-decoration: underline;
  font-weight: bold;
  // background-color: var(--tertiary);
  &:hover {
    color: var(--primary);
    background-color: var(--tertiary);
    box-shadow: 0px 0px 5px 2px var(--tertiary);
  }
}
</style>
