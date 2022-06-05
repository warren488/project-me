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
          <project-card />
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { Options, Vue } from "vue-class-component";
import Header from "@/components/Header.vue"; // @ is an alias to /src
import ProjectCard from "@/components/ProjectCard.vue"; // @ is an alias to /src

@Options({
  components: {
    Header,
    ProjectCard,
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
</style>
